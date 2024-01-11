const AWS = require('aws-sdk');
const axios = require('axios');


AWS.config.update({ region: 'us-east-2' });

const ECS = new AWS.ECS();
const CW = new AWS.CloudWatch();

const solaceSempOpenAPISpec = `https://${process.env.SOLACE_SEMP_URL}:${process.env.SOLACE_SEMP_PORT}/SEMP/v2/monitor/msgVpns/${process.env.SOLACE_MESSAGE_VPN_NAME}/queues/${process.env.SOLACE_QUEUE_NAME}`;


const getSolaceQueueDepth = () => {
    return axios.get(solaceSempOpenAPISpec, {
        auth: {
            username: process.env.SOLACE_ADMIN_USERNAME,
            password: process.env.SOLACE_ADMIN_PASSWORD
        }
    }).then(response => {
        if (!!response.data && !!response.data.collections && !!response.data.collections.msgs) {
            return response.data.collections.msgs.count
        }
        console.log('Invalid object returned');
        return '';
    }).catch(error => {
        console.log(error);
        return '';
    })
}

const getNumberOfActiveTaskInService = (clusterName, serviceName, cb) => {
    return new Promise((resolve, reject) => {
        ECS.listTasks({
            cluster: clusterName,
            desiredStatus: "RUNNING",
            serviceName: serviceName
        }, (err, data) => {
            if (err) {
                console.log('error retrieving active tasks')
                reject(err)
            }

            resolve(cb(data))
        })
    })
}

const scaleNoOfTasksInService = (clusterName, serviceName, noOfTaskDesired) => {
    return new Promise((resolve, reject) => {
        ECS.updateService({
            cluster: clusterName,
            service: serviceName,
            desiredCount: noOfTaskDesired
        }, (err, data) => {
            if (err) {
                reject(err)
            }
            resolve(data)
        })
    })
}

const putMetricData = (backlogPerTask, clusterName, serviceName) => {


    const metricName = process.env.METRIC_NAME
    const metricUnit = process.env.METRIC_UNIT
    const metricNamespace = process.env.METRIC_NAMESPACE

    const params = {
        Namespace: metricNamespace,
        MetricData: [{
            MetricName: metricName,
            Unit: metricUnit,
            Value: backlogPerTask,
            Dimensions: [
                {
                    Name: "ECSClusterName",
                    Value: clusterName
                },
                {
                    Name: "ECSServiceName",
                    Value: serviceName
                },
            ]
        }]
    }

    return new Promise((resolve, reject) => {
        CW.putMetricData(params, (err, data) => {
            if (err) {
                reject(err)
            }
            resolve(data)
        })
    })

}

const scaleECSTask = async (approximateNumberOfMessages) => {
    const averageProcessingTime = process.env.AVERAGE_PROCESSING_TIME
    const acceptableLatency = process.env.ACCEPTABLE_LATENCY
    const acceptableBacklogPerTask = acceptableLatency / averageProcessingTime
    const noOfTaskDesired = approximateNumberOfMessages / acceptableBacklogPerTask

    return await scaleNoOfTasksInService(
        process.env.ECS_CLUSTER_NAME,
        process.env.ECS_SERVICE_NAME,
        noOfTaskDesired
    )
}

exports.handler = async function (event, context) {
    try {

        const clusterName = process.env.ECS_CLUSTER_NAME
        const serviceName = process.env.ECS_SERVICE_NAME

        const approximateNumberOfMessages = await getSolaceQueueDepth()
        console.log('Approximate Number of Messages:', approximateNumberOfMessages);
        const numberOfActiveTaskInService = await getNumberOfActiveTaskInService(
            process.env.ECS_CLUSTER_NAME,
            process.env.ECS_SERVICE_NAME,
            ({ taskArns }) => taskArns.length
        )

        let backlogPerTask;
        if (numberOfActiveTaskInService == 0) {
            backlogPerTask = approximateNumberOfMessages;
        } else {
            backlogPerTask = approximateNumberOfMessages / numberOfActiveTaskInService
        }
        const metricData = await putMetricData(backlogPerTask, clusterName, serviceName)

        //Instead of using target auto scaling with custom metrics, we can opt-ed to scale ECS task manually
        //await scaleECSTask(approximateNumberOfMessages)

        console.log({
            numberOfActiveTaskInService,
            approximateNumberOfMessages,
            backlogPerTask
        })

        return {
            statusCode: 200,
            body: metricData
        };
    } catch (error) {
        const body = error.stack || JSON.stringify(error, null, 2);
        return {
            statusCode: 400,
            headers: {},
            body: JSON.stringify(body)
        }
    }
}