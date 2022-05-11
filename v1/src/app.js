'use strict';

/**
 * Follow these steps to configure the webhook in Slack:
 *
 *   1. Navigate to https://<your-team-domain>.slack.com/services/new
 *
 *   2. Search for and select "Incoming WebHooks".
 *
 *   3. Choose the default channel where messages will be sent and click "Add Incoming WebHooks Integration".
 *
 *   4. Copy the webhook URL from the setup instructions and use it in the next section.
 *
 *
 * Permissions to read secret:

{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "Stmt1443036478000",
            "Effect": "Allow",
            "Action": [
                "kms:Decrypt"
            ],
            "Resource": [
                "<your KMS key ARN>"
            ]
        }
    ]
}

Message builder website: https://api.slack.com/docs/messages/builder?msg=%7B"text"%3A"I%20am%20a%20test%20message"%2C"attachments"%3A%5B%7B"text"%3A"And%20here’s%20an%20attachment!"%7D%5D%7D

Message example with foot_icon

        slackMessage = {
            channel: slackChannel,
            attachments: [
                {
                    fallback: `The action "${action}" of the stage "${stage}" for CodePipeline "${pipeline}" in region "${region}" has ${state}.`,
                    color: color,
                    title: `${pipeline} | ${stage}`,
                    title_link: `https://console.aws.amazon.com/codepipeline/home?region=${region}#/view/${pipeline}`,
                    text: `${action} *${state}*`,
                    footer: `${detailType} | ${region}`,
                    footer_icon: image,
                    mrkdwn_in: ["text"],
                    ts: time
                }
            ]
        };

 */

const AWS = require('aws-sdk');
const url = require('url');
const https = require('https');

// The Slack channel to send a message to stored in the slackChannel environment variable
const slackChannel = process.env.CHANNEL;
// The current environment for this function.
const environment = process.env.ENVIRONMENT;
// The current region for this function.
const region = process.env.REGION;
// The ARN of the Webhook URL secret.
const webhookUrlSecretArn = process.env.WEBHOOK_URL_SECRET_ARN;

//The Slack Webhook URL and secret-related variables.
let webhookUrl,
    secret,
    decodedBinarySecret;

// Create a Secrets Manager client
var client = new AWS.SecretsManager({
    region: region
});

function postMessage(message, callback) {
    const body = JSON.stringify(message);
    const options = url.parse(webhookUrl);
    options.method = 'POST';
    options.headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
    };

    const postReq = https.request(options, (res) => {
        const chunks = [];
        res.setEncoding('utf8');
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
            if (callback) {
                callback({
                    body: chunks.join(''),
                    statusCode: res.statusCode,
                    statusMessage: res.statusMessage,
                });
            }
        });
        return res;
    });

    postReq.write(body);
    postReq.end();
}

function processEvent(message, callback) {

    /* Base Information */
    //const account = message.account;
    const detailType = message["detail-type"];
    const region = message.region;
    const time = ((new Date(message.time).getTime())/1000);

    /* Detailed Information */
    const action = message.detail.action;
    const stage = message.detail.stage;
    const pipeline = message.detail.pipeline;
    const state = message.detail.state;

    /* General Variables */
    var slackMessage = {},
        icon = ":grey_exclamation:",
        color = "#d5dbdb"; /* Gray, alternate: #687078 */

    /* Set the color of the message. */
    switch(state) {
        case "STARTED":
            color = "#0073bb"; /* Blue */
            icon = ":arrows_counterclockwise:"
            break;
        case "RESUMED":
            color = "#0073bb"; /* Blue */
            icon = ":arrows_counterclockwise:"
            break;
        case "FAILED":
            color = "#d13212"; /* Red */
            icon = ":x:"
            break;
        case "SUPERSEDED":
        case "CANCELED":
            color = "#d5dbdb"; /* Gray */
            icon = ":grey_exclamation:"
            break;
        case "SUCCEEDED":
            color = "#1d8102"; /* Green */
            icon = ":heavy_check_mark:"
            break;
    }

    /* Do some checking to see if this is an Action, Stage, or general CodePipeline event. */
    if (action) { /* CodePipeline Action Event */
        slackMessage = {
            channel: slackChannel,
            attachments: [
                {
                    fallback: `The action "${action}" of the stage "${stage}" for CodePipeline "${pipeline}" in region "${region}" has ${state}.`,
                    color: color,
                    title: `${pipeline} | ${stage}`,
                    title_link: `https://console.aws.amazon.com/codepipeline/home?region=${region}#/view/${pipeline}`,
                    text: `${icon} ${action} *${state}*`,
                    footer: `${detailType} | ${region}`,
                    mrkdwn_in: ["text"],
                    ts: time
                }
            ]
        };
    } else if (stage) { /* CodePipeline Stage Event */
        slackMessage = {
            channel: slackChannel,
            attachments: [
                {
                    fallback: `The stage "${stage}" for CodePipeline "${pipeline}" in region "${region}" has ${state}.`,
                    color: color,
                    title: `${pipeline} | ${stage}`,
                    title_link: `https://console.aws.amazon.com/codepipeline/home?region=${region}#/view/${pipeline}`,
                    text: `${icon} *${state}*`,
                    footer: `${detailType} | ${region}`,
                    mrkdwn_in: ["text"],
                    ts: time
                }
            ]
        };
    } else { /* CodePipeline Event */
        slackMessage = {
            channel: slackChannel,
            attachments: [
                {
                    fallback: `The CodePipeline "${pipeline}" in region "${region}" has ${state}.`,
                    color: color,
                    title: `${pipeline}`,
                    title_link: `https://console.aws.amazon.com/codepipeline/home?region=${region}#/view/${pipeline}`,
                    text: `${icon} *${state}*`,
                    footer: `${detailType} | ${region}`,
                    mrkdwn_in: ["text"],
                    ts: time
                }
            ]
        };
    }

    postMessage(slackMessage, (response) => {
        if (response.statusCode < 400) {
            console.info('Message posted successfully');
            callback(null);
        } else if (response.statusCode < 500) {
            console.error(`Error posting message to Slack API: ${response.statusCode} - ${response.statusMessage}`);
            callback(null);  // Don't retry because the error is due to a problem with the request
        } else {
            // Let Lambda retry
            callback(`Server error when processing message: ${response.statusCode} - ${response.statusMessage}`);
        }
    });
}


exports.handler = (event, context, callback) => {
    if (webhookUrl) {
        // Container reuse, simply process the event with the key in memory
        processEvent(event, callback);
    } else if (webhookUrlSecretArn) {
        client.getSecretValue({SecretId: webhookUrlSecretArn}, function(err, data) {
            if (err) {
                console.warn(`Secrets Manager Error: ${err.code}`);
                if (err.code === 'DecryptionFailureException')
                    // Secrets Manager can't decrypt the protected secret text using the provided KMS key.
                    // Deal with the exception here, and/or rethrow at your discretion.
                    throw err;
                else if (err.code === 'InternalServiceErrorException')
                    // An error occurred on the server side.
                    // Deal with the exception here, and/or rethrow at your discretion.
                    throw err;
                else if (err.code === 'InvalidParameterException')
                    // You provided an invalid value for a parameter.
                    // Deal with the exception here, and/or rethrow at your discretion.
                    throw err;
                else if (err.code === 'InvalidRequestException')
                    // You provided a parameter value that is not valid for the current state of the resource.
                    // Deal with the exception here, and/or rethrow at your discretion.
                    throw err;
                else if (err.code === 'ResourceNotFoundException')
                    // We can't find the resource that you asked for.
                    // Deal with the exception here, and/or rethrow at your discretion.
                    throw err;
            }
            else {
                // Decrypts secret using the associated KMS CMK.
                // Depending on whether the secret is a string or binary, one of these fields will be populated.
                if ('SecretString' in data) {
                    secret = data.SecretString;
                } else {
                    let buff = new Buffer(data.SecretBinary, 'base64');
                    decodedBinarySecret = buff.toString('ascii');
                }
            }
            
            webhookUrl = `https://${secret}`;
            processEvent(event, callback); 
        });
    } else {
        callback('Hook URL has not been set.');
    }
};
