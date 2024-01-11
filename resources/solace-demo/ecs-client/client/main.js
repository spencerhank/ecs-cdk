import solace from 'solclientjs';
import express from 'express';


const app = express();
const port = process.env.PORT || 3000;

const queueName = process.env.QUEUE_NAME;
const url = process.env.SERVICE_URL;
const userName = process.env.USER_NAME;
const password = process.env.PASSWORD;
const vpnName = process.env.VPN_NAME;

let factoryProps = new solace.SolclientFactoryProperties();
factoryProps.profile = solace.SolclientFactoryProfiles.version10;
solace.SolclientFactory.init(factoryProps);

let solaceClient = {};
solaceClient.session = null;
solaceClient.consumer = {};


async function connect() {
  if (solaceClient.session !== null) {
    console.log('Already connected and ready to subscribe');
    return;
  }

  try {
    solaceClient.session = solace.SolclientFactory.createSession({
      url: url,
      vpnName: vpnName,
      userName: userName,
      password: password
    });
  } catch (error) {
    console.log(error);
    throw new Error('Unable to Connecto to Solace Service');
  }

  solaceClient.session.on(solace.SessionEventCode.UP_NOTICE, function (sessionEvent) {
    console.log('=== Successfully connected and ready to subscribe. ===')
  });

  solaceClient.session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, function (sessionEvent) {
    console.log('Connection failed to the message router: ' + sessionEvent.infoStr +
      ' - check correct parameter values and connectivity!');
  });

  solaceClient.session.on(solace.SessionEventCode.DISCONNECTED, function (sessionEvent) {
    console.log('Disconnected.');
    solaceClient.subscribed = false;
    if (solaceClient.session !== null) {
      solaceClient.session.dispose();
      solaceClient.session = null;
    }
  });

  solaceClient.session.on(solace.SessionEventCode.SUBSCRIPTION_ERROR, function (sessionEvent) {
    console.log('Cannot subscribe to topic: ' + sessionEvent.correlationKey);
  });

  solaceClient.session.connect();
}

async function consume() {
  try {
    solaceClient.consumer = solaceClient.session.createMessageConsumer({
      queueDescriptor: { name: queueName, type: solace.QueueType.QUEUE },
      acknowledgeMode: solace.MessageConsumerAcknowledgeMode.CLIENT,
      createIfMissing: false
    })

    solaceClient.consumer.on(solace.MessageConsumerEventName.UP, function () {
      solaceClient.consumer.consuming = true;
      console.log('=== Ready to receive messages. ===');
    });
    solaceClient.consumer.on(solace.MessageConsumerEventName.CONNECT_FAILED_ERROR, function () {
      solaceClient.consumer.consuming = false;
      console.log('=== Error: the message consumer could not bind to queue "' + queueName +
        '" ===\n   Ensure this queue exists on the message router vpn');
      solaceClient.consumer.exit();
    });
    solaceClient.consumer.on(solace.MessageConsumerEventName.DOWN, function () {
      solaceClient.consumer.consuming = false;
      console.log('=== The message consumer is now down ===');
    });
    solaceClient.consumer.on(solace.MessageConsumerEventName.DOWN_ERROR, function () {
      solaceClient.consumer.consuming = false;
      console.log('=== An error happened, the message consumer is down ===');
    });
    solaceClient.consumer.on(solace.MessageConsumerEventName.MESSAGE, function (message) {
      try {
        console.log('Message Received');
        message.acknowledge();
      } catch (error) {
        message.settle(solace.MessageOutcome.REJECTED)
      }
    });
    solaceClient.consumer.connect();
  } catch (error) {
    console.log('Unable to consume from queue', error);
  }
}

async function stopConsume() {
  if (solaceClient.session !== null) {
    try {
      solaceClient.consumer.consuming = false;
      solaceClient.session.disconnect();
      solaceClient.consumer.dispose();
    } catch (error) {
      console.log("Unable to disconnect the consumer:", error);
    }
  }
}

app.get('/health', async (req, res) => {
  try {
    if (solaceClient.consumer && solaceClient.consumer.consuming == true) {
      res.status(200).json({ status: 'OK' })
    } else {
      res.status(500).json({ status: 'Error', message: 'Service not up' })
    }
  } catch (error) {
    res.status(500).json({ status: 'Error', message: 'Service not up' })
  }
}

)

async function main() {
  console.log('Service is started');
  try {
    connect();
    consume();

  } catch (error) {
    console.error('Error in main loop:', error);
    console.log('Disconnecting consumer');
    stopConsume();
    setTimeout(function () {
      process.exit()
    }, 1000);
  }

  app.listen(3000, () => {
    console.log('Listening on port 3000');
  })

}

main();
process.stdin.resume();
process.on('SIGINT', function () {
  stopConsume();
  setTimeout(function () {
    process.exit()
  }, 1000);
})
