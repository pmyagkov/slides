(function() {
    var MODES = {
        SLAVE: 'slave',
        MASTER: 'master'
    };

    function renderPanel() {
        var html = yr.run('main', state, 'control-panel');
        $('.control-panel').replaceWith(html);
    }

    function moveSlide(next) {
        // offline
        if (!state.online && typeof next === 'boolean') {
            next = state.offlineCurrent + (next ? 1 : -1);
        }

        if (next < 0) {
            next = 0;
        }

        if (next > state.slides.length - 1) {
            next = state.slides.length;
        }

        if (state.online) {
            state.current = next;
        } else {
            state.offlineCurrent = next;
        }


        $('.slides').css('margin-top', -100 * next + 'vh');
    }

    function switchMode(master) {
        if (master !== state.master) {
            state.master = master;
            $('.mode').text(master ? MODES.MASTER.toUpperCase() : MODES.SLAVE.toUpperCase());
        }
    }

    function send(event, data) {
        socket.send(JSON.stringify({event: event, data: data}));
    }

    var state;


    var $ = require('jquery');

    var port = '1400';

    var pageUrl = /^https?:\/\/([^:/]*)[:/]/.exec(location.href)[1];
    var url = "ws://" + pageUrl + ":" + port;// + "/game";

    var socket  = new WebSocket(url);

    socket.onopen = function() {
        console.log('SOCKET OPENED');
    };

    socket.onclose = function() {
        console.log('SOCKET CLOSED');
    };

    // можно использовать addEventListener
    socket.onmessage = function(message) {
        console.log('raw', message.data);
        var envelope = JSON.parse(message.data);

        console.log('MESSAGE', envelope);

        switch(envelope.event) {
        case 'slides':
            state = envelope.data;
            state.online = true;
            var html = yr.run('main', envelope.data);
            $('body').empty().append(html);

            moveSlide(envelope.data.current);
            renderPanel();
            break;

        case 'move':
            var next = envelope.data.next;

            if (state.online) {
                moveSlide(next);
            } else {
                state.current = next;
            }

            switchMode(envelope.data.master);
            renderPanel();
            break;
        }
    };

    function closePrompt() {
        $('.mode-prompt').hide();
        clearTimeout(promptTimeout);
        wantingDirection = null;
        waitingForDecision = false;
    }

    // ждем решения переключения в MASTER mode
    var waitingForDecision = false;
    var wantingDirection;

    var promptTimeout;

    $(document).on('keydown', function(e) {
        console.log('KEY', e.which);

        if ([37, 38, 39, 40, 27, 13].indexOf(e.which) > -1) {
            e.preventDefault();
        }

        var direction;
        switch(e.which) {
        // left
        case 37:
        // up
        case 38:
            direction = 'prev';
            break;

        // right
        case 39:
        // down
        case 40:
            direction = 'next';
            break;
        }

        if (state.online && !state.master && !waitingForDecision && direction) {
            console.warn('SLAVE mode');
            var $modePrompt = $('.mode-prompt');
            if (!$modePrompt.length) {
                var html = yr.run('main', {}, 'mode-prompt');
                $(html).appendTo($('body'));
            } else {
                $modePrompt.show();
            }

            promptTimeout = setTimeout(closePrompt, 2000);

            wantingDirection = direction;
            waitingForDecision = true;

            return;
        }

        var dataToSend;

        if (waitingForDecision && [27, 13].indexOf(e.which) > -1) {
            // ENTER
            if (e.which === 13) {
                dataToSend = {
                    direction: wantingDirection,
                    master: true
                };
            }

            closePrompt()
        }

        if (!dataToSend) {
            dataToSend = {
                direction: direction
            };
        }

        if (state.online) {
            send('move', dataToSend);
        } else if (state.offlineCurrent) {
            moveSlide(direction === 'next');
            renderPanel();
        }

    });

    function setConnectivity(online) {
        state.online = online;
        if (!online) {
            state.offlineCurrent = state.current;
        } else {
            state.offlineCurrent = null;
            renderPanel();
            moveSlide(state.current);
        }


    }

    $(document).on('click', '.connectivity', function(e) {
        var $target = $(e.currentTarget);
        var online = true;
        if ($target.is('.online')) {
            online = false;
        }

        $target.toggleClass('online', online).toggleClass('offline', !online);

        setConnectivity(online);

        return false;
    });

})();
