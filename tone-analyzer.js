/**
  * main() will be invoked when you Run This Action.
  */

const { promisify } = require('util');
const request = promisify(require('request'));

async function main(params, body) {
    console.log('Input to action', JSON.stringify(params, null, 2).replace(new RegExp('\n', 'g'), ''));
    let {
        status,
    } = params;
    const owBodyStr = params['__ow_body'] || '{}';
    const owBody = JSON.parse(owBodyStr);
    status = !status ? (owBody && owBody.status) : status;
    console.log('status input: ', status);
    if (!status) {
        return getErrorResponse();
    }
    let response;
    const url = 'https://gateway.watsonplatform.net/tone-analyzer/api/v3/tone?version=2017-09-21';
    const options = {
        method: 'POST',
        url,
        headers: {
            accept: 'application/json',
            'content-type': 'application/json',
        },
        auth: {
            username: 'TODO',
            password: 'TODO',
            sendImmediately: false,
        },
        body: { text: status },
        json: true,
    };
    try {
        response = await request(options);
    } catch (err) {
        return getErrorResponse();
    }

    console.log('after calling tone', response.statusCode,
        JSON.stringify(response.body, null, 2).replace(new RegExp('\n', 'g'), ''));
    /** The response body contains temperature data in the following format
    *    {
    *       result: true/false
    *    }
    */
    const isAnger = getIsAnger(response.body);
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
            result: isAnger,
        },
    };
}

exports.main = main;

function getIsAnger(response) {
    const { tones } = response.document_tone;
    const angerTone = tones.filter(tone => tone.tone_id === 'anger');
    if (!angerTone || !angerTone.length) {
        return false;
    }
    return angerTone[0].score > 0.6;
}

function getErrorResponse() {
    return Promise.reject({
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: { message: 'Error processing your request' },
    });
}
