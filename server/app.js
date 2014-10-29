var request = require('request');
var http = require('http');
var WebSocketServer = require('websocket').server;
var vow = require('vow');
var _ = require('lodash');
var fs = require('fs');
// https://oauth.yandex.ru/authorize?response_type=token&client_id=f13cc55f54ec4a0abc8f593236280215

var CONFIG = {
    'oauthToken': 'dfec2213aaf5461fba121e296fa783b8',
    'diskFolder': 'Slides',
    'localFolder': 'build/slides'
};

function buf2json(buf){
    return JSON.parse(buf.toString());
}

function downloadFile(name, href) {
    var fs = require('fs');

    var path = CONFIG['localFolder'] + '/' + name;

    var def = new vow.Deferred();

    console.log('DOWNLOADING');

    request(getRequestInfo('download', {href: href})).on('end', function() {
        console.log(name, 'CLOSED');
        def.resolve(path);
    }).pipe(fs.createWriteStream(path));

    return def.promise();
}

function getSlideNumber(name) {
    var matches = /\d+/.exec(name);
    if (!matches || !matches.length) {
        return Number.POSITIVE_INFINITY;
    }

    return parseInt(matches[0]);
}

/**
 * @param {String} type   meta|resource|download
 * @param {Object} [options]
 * @returns {Object}
 */
function getRequestInfo(type, options) {
    var requestInfo = {
        headers: {'Authorization': 'OAuth ' + CONFIG['oauthToken']}
    };

    var url;

    switch(type) {
    case 'meta':
        url = 'https://cloud-api.yandex.net/v1/disk/resources?path=' + CONFIG['diskFolder'];
        break;

    case 'resource':
        url = 'https://cloud-api.yandex.net/v1/disk/resources/download?path=' + CONFIG['diskFolder'] + '/' + options.name;
        break;

    case 'download':
        url = options.href;
        break;
    }

    requestInfo['url'] = url;

    return requestInfo;
}

var diskData;
var slides = [];

var needToUpdateSlides = false;
console.log('ARGS', process.argv);
if (process.argv.length === 3 && (process.argv[2] === '--update' || process.argv[2] === '-u')) {
    needToUpdateSlides = true;
}

console.log('UPDATE SLIDES', needToUpdateSlides);

var masterConnection;

function removeSlides() {
    console.log('REMOVING OLD FILES');

    var promises = [];

    fs.readdir(CONFIG.localFolder, function(err, files) {
        if (!err) {
            files.forEach(function(file) {
                var def = new vow.Deferred();
                promises.push(def.promise());
                fs.unlink(CONFIG.localFolder + '/' + file, function(err) {
                    def.resolve();
                })
            });
        }
    })

    return vow.all(promises);
}

function downloadSlides() {
    request(getRequestInfo('meta'), function(error, response, body) {
        if (!error && response.statusCode == 200) {
            diskData = JSON.parse(body);
            var items = diskData['_embedded'].items;

            removeSlides().then(function() {
                var promises = items.map(function(item) {

                    var def = new vow.Deferred();

                    request(getRequestInfo('resource', {name: item.name}), function(err, res, body) {
                        if (!err && response.statusCode == 200) {
                            var info = JSON.parse(body);

                            downloadFile(item.name, info.href).then(function(path) {
                                slides.push({
                                    name: item.name,
                                    href: info.href,
                                    path: item.name
                                });

                                def.resolve();
                            });

                        } else {
                            def.reject();
                            console.error(err);
                        }

                    });

                    return def.promise();
                });

                vow.all(promises).then(function() {
                    renewSlidesPromise(sortSlidesForClient(slides));

                    console.log('SLIDES', slides);
                });
            })
        }
    });
}

function sortSlidesForClient(slides) {
    slides.sort(function(one, other) {
        return getSlideNumber(one.name) > getSlideNumber(other.name);
    });

    return slides.map(function(slide) {return slide.path});
}


function renewSlidesPromise(data) {
    if (slidesDeferred.isResolved) {
        slidesDeferred = vow.resolve(data);
    } else {
        slidesDeferred.resolve(data);
    }
}

function whenSlidesReady() {
    return slidesDeferred.promise();
}

var slidesDeferred = new vow.Deferred();
var currentSlide = 0;
var connections = [];


if (needToUpdateSlides) {
    downloadSlides();
} else {
    fs.readdir(CONFIG.localFolder, function(err, dir) {
        if (!err) {

            console.log('DIR', dir.map(function(file) {
                return CONFIG.localFolder + '/' + file;
            }));
            slides = dir.map(function(file) {
                return file;
            });

	        console.log('CLIENT SLIDES', slides);

            renewSlidesPromise(slides);
        }

    })
}

var server = http.createServer(function(request, response) {
    response.end(404, '');
});

function onMessage(message) {
    var that = this;

    console.log('MESSAGE RECEIVED', message);
    var envelope = JSON.parse(message.utf8Data);

    whenSlidesReady().then(function() {
        var data = envelope.data;
        if (envelope.event === 'move') {
            if (['prev', 'next'].indexOf(data.direction) === -1) {
                return;
            }

            if (data.master) {
                console.log('CHANGEING THE MASTER!');
                masterConnection = that;
            } else if (that !== masterConnection) {
                return;
            }

            currentSlide += data.direction === 'next' ? 1 : -1;
            if (currentSlide < 0) {
                currentSlide = 0;
            }
            if (currentSlide >= slides.length) {
                currentSlide = slides.length - 1;
            }

            console.log('SLIDES', slides);

            connections.forEach(function(connection) {
                connection.send(JSON.stringify({
                    event: 'move',
                    data: {
                        next: currentSlide,
                        master: connection === masterConnection
                    }
                }))
            })
        }
    });

}

function onClose(reasonCode, description) {
    console.log('CONNECTION CLOSED!', reasonCode, description);
}


server.listen(process.env.PORT || 1400, function() {
    console.log('SERVER IS STARTED. PORT:', server.address().port);

    var webSocketServer = new WebSocketServer({
        httpServer: server
    });

    webSocketServer.on('request', function(request) {
        console.log('CONNECTION REQUEST');
        var connection = request.accept(null, request.origin);

        connections.push(connection);

        connection.on('message', onMessage.bind(connection));
        connection.on('close', onClose.bind(connection));

        whenSlidesReady().then(function(slides) {
            console.log('SENDING SLIDES', 'is master?', connections.length === 1, 'currentSlide', currentSlide);
            connection.send(JSON.stringify({
                event: 'slides',
                data: {
                    slides: slides,
                    master: connections.length === 1, // мастером становится первый подключившийся
                    current: currentSlide
                }
            }));

            if (connections.length === 1) {
                masterConnection = connection;
            }
        });
    });
});

