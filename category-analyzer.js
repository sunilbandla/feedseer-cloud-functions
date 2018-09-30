/**
  * main() will be invoked when you Run This Action.
  */

const { promisify } = require('util');
const request = promisify(require('request'));

const normalizeUrl = getNormalizeUrl();
const ipRegex = getIpRegex();
// TODO use tlds module
const tlds = [];

const WATSON_URL = 'https://gateway.watsonplatform.net/natural-language-understanding/api/v1/analyze?version=2018-03-16';

async function main(params, body) {
    console.log('Input to action', JSON.stringify(params, null, 2).replace(new RegExp('\n', 'g'), ''));
    let {
        status,
        category,
    } = params;
    const owBodyStr = params.__ow_body || '{}';
    const owBody = JSON.parse(owBodyStr);
    status = !status ? (owBody && owBody.status) : status;
    const urlsInText = [...getUrls(status)];
    category = category || '';
    console.log('status input: ', status, category, urlsInText);
    if (!status) {
        return getErrorResponse();
    }
    const categories = (category && category.split(',')) || [];
    const result = await analyzeStatus(status, categories, urlsInText);
    console.log('status result: ', result);
    /** The response body is in the following format
    *    {
    *       result: true/false
    *    }
    */
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
            result,
        },
    };
}

exports.main = main;

function processResponse(response, categoriesToCheck) {
    const { categories } = response;
    categories.sort((a, b) => a.score > b.score);
    const matchCategories = categories.filter(c => categoriesToCheck.some(category => c.label.includes(category)));
    return matchCategories.some(c => c.score > 0.05);
}

function getErrorResponse() {
    return Promise.reject({
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: { message: 'Error processing your request' },
    });
}

async function analyzeStatus(status, categories, urlsInText) {
    const textResponse = await analyzeText(status);
    const result = processResponse(textResponse.body, categories);
    if (result) {
        return result;
    }
    const urlResponses = await analyzeUrls(urlsInText);
    if (urlResponses && urlResponses.length) {
        return urlResponses.some(response => processResponse(response.body, categories));
    }
    return result;
}

function getDefaultWatsonOptions() {
    return {
        method: 'POST',
        url: WATSON_URL,
        headers: {
            accept: 'application/json',
            'content-type': 'application/json',
        },
        auth: {
            username: 'TODO',
            password: 'TODO',
            sendImmediately: false,
        },
        json: true,
    };
}

async function analyzeUrls(urlsInText) {
    if (!urlsInText || !urlsInText.length) {
        return null;
    }
    // eslint-disable-next-line
    return Promise.all(urlsInText.map(async function analyze(url) {
        const response = await analyzeUrl(url);
        return response;
    }));
}

async function analyzeUrl(url) {
    let response;
    const options = {
        ...getDefaultWatsonOptions(),
        body: {
            url,
            features: {
                categories: {},
            },
        },
    };
    try {
        response = await request(options);
    } catch (err) {
        return getErrorResponse();
    }

    console.log('after calling category analyzer on url', url, response.statusCode,
        JSON.stringify(response.body, null, 2).replace(new RegExp('\n', 'g'), ''));

    return response;
}

async function analyzeText(status) {
    let response;
    const options = {
        ...getDefaultWatsonOptions(),
        body: {
            text: status,
            features: {
                categories: {},
            },
        },
    };
    try {
        response = await request(options);
    } catch (err) {
        return getErrorResponse();
    }

    console.log('after calling category analyzer on text', response.statusCode,
        JSON.stringify(response.body, null, 2).replace(new RegExp('\n', 'g'), ''));

    return response;
}

// TODO replace below code with node packages
/* eslint-disable */
function getUrls(text, options = {}) {
    if (typeof options.exclude !== 'undefined' && !Array.isArray(options.exclude)) {
        throw new TypeError('The `exclude` option must be an array');
    }

    const ret = new Set();

    const add = url => {
        ret.add(normalizeUrl(url.trim().replace(/\.+$/, ''), options));
    };

    const urls = text.match(urlRegex()) || [];
    for (const url of urls) {
        add(url);

        if (options.extractFromQueryString) {
            for (const qsUrl of getUrlsFromQueryParams(url)) {
                add(qsUrl);
            }
        }
    }

    for (const excludedItem of options.exclude || []) {
        for (const item of ret) {
            const regex = new RegExp(excludedItem);
            if (regex.test(item)) {
                ret.delete(item);
                break;
            }
        }
    }

    return ret;
};

function urlRegex(opts) {
    opts = Object.assign({ strict: true }, opts);

    const protocol = `(?:(?:[a-z]+:)?//)${opts.strict ? '' : '?'}`;
    const auth = '(?:\\S+(?::\\S*)?@)?';
    const ip = ipRegex.v4().source;
    const host = '(?:(?:[a-z\\u00a1-\\uffff0-9]-*)*[a-z\\u00a1-\\uffff0-9]+)';
    const domain = '(?:\\.(?:[a-z\\u00a1-\\uffff0-9]-*)*[a-z\\u00a1-\\uffff0-9]+)*';
    const tld = `(?:\\.${opts.strict ? '(?:[a-z\\u00a1-\\uffff]{2,})' : `(?:${tlds.sort((a, b) => b.length - a.length).join('|')})`})\\.?`;
    const port = '(?::\\d{2,5})?';
    const path = '(?:[/?#][^\\s"]*)?';
    const regex = `(?:${protocol}|www\\.)${auth}(?:localhost|${ip}|${host}${domain}${tld})${port}${path}`;

    return opts.exact ? new RegExp(`(?:^${regex}$)`, 'i') : new RegExp(regex, 'ig');
};

function getIpRegex() {
    const word = '[a-fA-F\\d:]';
    const b = `(?:(?<=\\s|^)(?=${word})|(?<=${word})(?=\\s|$))`;

    const v4 = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)){3}';

    const v6seg = '[a-fA-F\\d]{1,4}';
    const v6 = `
    (
    (?:${v6seg}:){7}(?:${v6seg}|:)|                                // 1:2:3:4:5:6:7::  1:2:3:4:5:6:7:8
    (?:${v6seg}:){6}(?:${v4}|:${v6seg}|:)|                         // 1:2:3:4:5:6::    1:2:3:4:5:6::8   1:2:3:4:5:6::8  1:2:3:4:5:6::1.2.3.4
    (?:${v6seg}:){5}(?::${v4}|(:${v6seg}){1,2}|:)|                 // 1:2:3:4:5::      1:2:3:4:5::7:8   1:2:3:4:5::8    1:2:3:4:5::7:1.2.3.4
    (?:${v6seg}:){4}(?:(:${v6seg}){0,1}:${v4}|(:${v6seg}){1,3}|:)| // 1:2:3:4::        1:2:3:4::6:7:8   1:2:3:4::8      1:2:3:4::6:7:1.2.3.4
    (?:${v6seg}:){3}(?:(:${v6seg}){0,2}:${v4}|(:${v6seg}){1,4}|:)| // 1:2:3::          1:2:3::5:6:7:8   1:2:3::8        1:2:3::5:6:7:1.2.3.4
    (?:${v6seg}:){2}(?:(:${v6seg}){0,3}:${v4}|(:${v6seg}){1,5}|:)| // 1:2::            1:2::4:5:6:7:8   1:2::8          1:2::4:5:6:7:1.2.3.4
    (?:${v6seg}:){1}(?:(:${v6seg}){0,4}:${v4}|(:${v6seg}){1,6}|:)| // 1::              1::3:4:5:6:7:8   1::8            1::3:4:5:6:7:1.2.3.4
    (?::((?::${v6seg}){0,5}:${v4}|(?::${v6seg}){1,7}|:))           // ::2:3:4:5:6:7:8  ::2:3:4:5:6:7:8  ::8             ::1.2.3.4
    )(%[0-9a-zA-Z]{1,})?                                           // %eth0            %1
    `.replace(/\s*\/\/.*$/gm, '').replace(/\n/g, '').trim();

    const ip = opts => opts && opts.exact ?
        new RegExp(`(?:^${v4}$)|(?:^${v6}$)`) :
        new RegExp(`(?:${b}${v4}${b})|(?:${b}${v6}${b})`, 'g');

    ip.v4 = opts => opts && opts.exact ? new RegExp(`^${v4}$`) : new RegExp(`${b}${v4}${b}`, 'g');
    ip.v6 = opts => opts && opts.exact ? new RegExp(`^${v6}$`) : new RegExp(`${b}${v6}${b}`, 'g');

    return ip;
}

function getNormalizeUrl() {
    // TODO: Use the `URL` global when targeting Node.js 10
    const URLParser = typeof URL === 'undefined' ? require('url').URL : URL;

    const testParameter = (name, filters) => {
        return filters.some(filter => filter instanceof RegExp ? filter.test(name) : filter === name);
    };

    return (urlString, opts) => {
        opts = Object.assign({
            defaultProtocol: 'http:',
            normalizeProtocol: true,
            forceHttp: false,
            forceHttps: false,
            stripHash: true,
            stripWWW: true,
            removeQueryParameters: [/^utm_\w+/i],
            removeTrailingSlash: true,
            removeDirectoryIndex: false,
            sortQueryParameters: true
        }, opts);

        // Backwards compatibility
        if (Reflect.has(opts, 'normalizeHttps')) {
            opts.forceHttp = opts.normalizeHttps;
        }

        if (Reflect.has(opts, 'normalizeHttp')) {
            opts.forceHttps = opts.normalizeHttp;
        }

        if (Reflect.has(opts, 'stripFragment')) {
            opts.stripHash = opts.stripFragment;
        }

        urlString = urlString.trim();

        const hasRelativeProtocol = urlString.startsWith('//');
        const isRelativeUrl = !hasRelativeProtocol && /^\.*\//.test(urlString);

        // Prepend protocol
        if (!isRelativeUrl) {
            urlString = urlString.replace(/^(?!(?:\w+:)?\/\/)|^\/\//, opts.defaultProtocol);
        }

        const urlObj = new URLParser(urlString);

        if (opts.forceHttp && opts.forceHttps) {
            throw new Error('The `forceHttp` and `forceHttps` options cannot be used together');
        }

        if (opts.forceHttp && urlObj.protocol === 'https:') {
            urlObj.protocol = 'http:';
        }

        if (opts.forceHttps && urlObj.protocol === 'http:') {
            urlObj.protocol = 'https:';
        }

        // Remove hash
        if (opts.stripHash) {
            urlObj.hash = '';
        }

        // Remove duplicate slashes if not preceded by a protocol
        if (urlObj.pathname) {
            // TODO: Use the following instead when targeting Node.js 10
            // `urlObj.pathname = urlObj.pathname.replace(/(?<!https?:)\/{2,}/g, '/');`
            urlObj.pathname = urlObj.pathname.replace(/((?![https?:]).)\/{2,}/g, (_, p1) => {
                if (/^(?!\/)/g.test(p1)) {
                    return `${p1}/`;
                }
                return '/';
            });
        }

        // Decode URI octets
        if (urlObj.pathname) {
            urlObj.pathname = decodeURI(urlObj.pathname);
        }

        // Remove directory index
        if (opts.removeDirectoryIndex === true) {
            opts.removeDirectoryIndex = [/^index\.[a-z]+$/];
        }

        if (Array.isArray(opts.removeDirectoryIndex) && opts.removeDirectoryIndex.length > 0) {
            let pathComponents = urlObj.pathname.split('/');
            const lastComponent = pathComponents[pathComponents.length - 1];

            if (testParameter(lastComponent, opts.removeDirectoryIndex)) {
                pathComponents = pathComponents.slice(0, pathComponents.length - 1);
                urlObj.pathname = pathComponents.slice(1).join('/') + '/';
            }
        }

        if (urlObj.hostname) {
            // Remove trailing dot
            urlObj.hostname = urlObj.hostname.replace(/\.$/, '');

            // Remove `www.`
            if (opts.stripWWW && /^www\.([a-z\-\d]{2,63})\.([a-z.]{2,5})$/.test(urlObj.hostname)) {
                // Each label should be max 63 at length (min: 2).
                // The extension should be max 5 at length (min: 2).
                // Source: https://en.wikipedia.org/wiki/Hostname#Restrictions_on_valid_host_names
                urlObj.hostname = urlObj.hostname.replace(/^www\./, '');
            }
        }

        // Remove query unwanted parameters
        if (Array.isArray(opts.removeQueryParameters)) {
            for (const key of [...urlObj.searchParams.keys()]) {
                if (testParameter(key, opts.removeQueryParameters)) {
                    urlObj.searchParams.delete(key);
                }
            }
        }

        // Sort query parameters
        if (opts.sortQueryParameters) {
            urlObj.searchParams.sort();
        }

        // Take advantage of many of the Node `url` normalizations
        urlString = urlObj.toString();

        // Remove ending `/`
        if (opts.removeTrailingSlash || urlObj.pathname === '/') {
            urlString = urlString.replace(/\/$/, '');
        }

        // Restore relative protocol, if applicable
        if (hasRelativeProtocol && !opts.normalizeProtocol) {
            urlString = urlString.replace(/^http:\/\//, '//');
        }

        return urlString;
    };
}
