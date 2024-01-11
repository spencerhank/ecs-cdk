const AWS = require('aws-sdk');

const visibilityTimeout = 60 * 10;
const waitingTimeout = 20;

const msgType = {
  Message: String,
};

AWS.config.update({ region: 'us-east-2' });

const sqs = new AWS.SQS();

async function processSQS(queueUrl) {
  const params = {
    QueueUrl: queueUrl,
    MaxNumberOfMessages: 5,
    VisibilityTimeout: visibilityTimeout,
    WaitTimeSeconds: waitingTimeout,
  };

  try {
    const data = await sqs.receiveMessage(params).promise();

    console.log(`Received messages: ${data.Messages ? data.Messages.length : 0}`);

    if (!data.Messages) {
      return false;
    }

    if (data.Messages.length === 0) {
        return true;
    }

    for (const msg of data.Messages) {
      const id = msg.MessageId;
      const newMsg = JSON.parse(msg.Body, msgType);

      console.log(`Message id ${id} received from SQS:`, newMsg.Body);

      await sqs.deleteMessage({
        QueueUrl: queueUrl,
        ReceiptHandle: msg.ReceiptHandle,
      }).promise();

      console.log(`Message id ${id} deleted from queue`);
    }

    return true;
  } catch (error) {
    console.error('Error processing SQS:', error);
    return false;
  }
}

async function sleep() {
    return new Promise(resolve => setTimeout(resolve, 20000));
}

async function main() {
  console.log('Service is started');

  const queueUrl = process.env.SQS_URL;
  console.log(`QUEUE_URL: ${queueUrl}`);

  try {
    while (true) {
      const success = await processSQS(queueUrl);

      if (!success) {
        break;
      }
      console.log('sleeping');
      await sleep();
      console.log('done sleeping');
    }
  } catch (error) {
    console.error('Error in main loop:', error);
  }

  console.log('Service is safely stopped');
}

main();
