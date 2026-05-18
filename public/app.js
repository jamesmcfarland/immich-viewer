(function () {
  var app = document.getElementById('app');
  var slidesEl = document.getElementById('slides');
  var dateLabelEl = document.getElementById('date-label');

  var state = {
    config: null,
    album: null,
    slides: [],
    currentIndex: -1,
    currentAssetId: null,
    activeSlide: null,
    queuedSlide: null,
    timerId: null,
    refreshId: null,
    pendingIndex: -1
  };

  function xhrGet(target, callback) {
    var request = new XMLHttpRequest();

    request.onreadystatechange = function () {
      if (request.readyState !== 4) {
        return;
      }

      if (request.status >= 200 && request.status < 300) {
        callback(null, request.responseText);
        return;
      }

      callback(new Error('HTTP ' + request.status));
    };

    request.open('GET', target, true);
    request.send();
  }

  function setStatus(text) {
    app.setAttribute('data-status', text || '');
  }

  function setCaption(text, visible) {
    app.setAttribute('data-caption', visible ? (text || '') : '');
  }

  function padNumber(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function getOrdinalSuffix(day) {
    if (day >= 11 && day <= 13) {
      return 'th';
    }

    if (day % 10 === 1) {
      return 'st';
    }

    if (day % 10 === 2) {
      return 'nd';
    }

    if (day % 10 === 3) {
      return 'rd';
    }

    return 'th';
  }

  function formatDate(value) {
    var date;
    var months;
    var day;

    if (!value) {
      return '';
    }

    date = new Date(value);

    if (isNaN(date.getTime())) {
      return value;
    }

    months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December'
    ];
    day = date.getDate();

    return day + getOrdinalSuffix(day) + ' ' + months[date.getMonth()] + ' ' + date.getFullYear();
  }

  function setDateLabel(value) {
    var text = formatDate(value);

    if (!state.config.slideshow.showDate || !text) {
      dateLabelEl.style.display = 'none';
      dateLabelEl.innerHTML = '';
      return;
    }

    dateLabelEl.innerHTML = text;
    dateLabelEl.style.display = 'block';
  }

  function shuffle(items) {
    var copy = items.slice(0);
    var i;
    var j;
    var temp;

    for (i = copy.length - 1; i > 0; i -= 1) {
      j = Math.floor(Math.random() * (i + 1));
      temp = copy[i];
      copy[i] = copy[j];
      copy[j] = temp;
    }

    return copy;
  }

  function buildQueue(assets) {
    var queue = assets.slice(0);
    var currentItem = null;
    var i;

    if (state.config.slideshow.shuffle) {
      queue = shuffle(queue);
    }

    if (!state.currentAssetId) {
      return {
        slides: queue,
        currentIndex: -1
      };
    }

    for (i = 0; i < queue.length; i += 1) {
      if (queue[i].id === state.currentAssetId) {
        currentItem = queue.splice(i, 1)[0];
        break;
      }
    }

    if (!currentItem) {
      return {
        slides: queue,
        currentIndex: -1
      };
    }

    queue.unshift(currentItem);

    return {
      slides: queue,
      currentIndex: 0
    };
  }

  function forceReflow(element) {
    return element.offsetWidth;
  }

  function createSlide(url) {
    var slide = document.createElement('div');
    var background = document.createElement('div');
    var image = document.createElement('img');

    slide.className = 'slide';

    if (state.config.slideshow.imageFit === 'cover') {
      slide.className += ' is-cover';
    } else {
      slide.className += ' is-contain';
    }

    slide.style.webkitTransitionDuration = state.config.slideshow.transitionMs + 'ms';
    slide.style.transitionDuration = state.config.slideshow.transitionMs + 'ms';
    slide.style.webkitTransitionProperty = 'opacity';
    slide.style.transitionProperty = 'opacity';
    slide.style.opacity = '0';
    slide.style.zIndex = '1';

    background.className = 'slide-bg';
    background.style.backgroundImage = 'url("' + url + '")';

    image.className = 'slide-image';
    image.alt = '';

    slide.appendChild(background);
    slide.appendChild(image);

    return {
      root: slide,
      image: image
    };
  }

  function removeSlide(slide) {
    if (slide && slide.parentNode) {
      slide.parentNode.removeChild(slide);
    }
  }

  function getNextIndex() {
    var nextIndex = state.currentIndex + 1;

    if (!state.slides.length) {
      return -1;
    }

    if (nextIndex >= state.slides.length) {
      nextIndex = 0;

      if (state.config.slideshow.shuffle) {
        state.slides = shuffle(state.slides);
      }
    }

    return nextIndex;
  }

  function queueNextSlide(index, callback) {
    var item;
    var nextUrl;
    var slideParts;

    if (!state.slides.length || index < 0 || index >= state.slides.length) {
      callback(new Error('No slide to queue'));
      return;
    }

    item = state.slides[index];
    nextUrl = '/image/' + encodeURIComponent(item.id);
    slideParts = createSlide(nextUrl);

    slideParts.image.onload = function () {
      callback(null, {
        index: index,
        item: item,
        slide: slideParts.root
      });
    };

    slideParts.image.onerror = function () {
      callback(new Error('Could not load image'));
    };

    slideParts.image.src = nextUrl;
  }

  function scheduleNextAdvance() {
    if (state.timerId) {
      window.clearTimeout(state.timerId);
    }

    state.timerId = window.setTimeout(function () {
      advanceSlide();
    }, state.config.slideshow.slideSeconds * 1000);
  }

  function primeNextSlide() {
    var nextIndex = getNextIndex();

    if (state.pendingIndex === nextIndex || (state.queuedSlide && state.queuedSlide.index === nextIndex)) {
      return;
    }

    state.pendingIndex = nextIndex;

    queueNextSlide(nextIndex, function (error, queued) {
      if (state.pendingIndex !== nextIndex) {
        return;
      }

      state.pendingIndex = -1;

      if (error) {
        setStatus('Could not load next image. Retrying…');
        window.setTimeout(function () {
          primeNextSlide();
        }, 1000);
        return;
      }

      state.queuedSlide = queued;
    });
  }

  function activateQueuedSlide() {
    var queued = state.queuedSlide;
    var previousSlide = state.activeSlide;
    var showCaption;

    if (!queued) {
      primeNextSlide();
      return;
    }

    showCaption = !!state.config.slideshow.showCaption;

    if (previousSlide) {
      previousSlide.style.zIndex = '1';
    }

    queued.slide.style.zIndex = '2';
    queued.slide.style.opacity = '0';
    slidesEl.appendChild(queued.slide);
    forceReflow(queued.slide);

    window.setTimeout(function () {
      forceReflow(queued.slide);

      window.setTimeout(function () {
        queued.slide.style.opacity = '1';

        if (previousSlide) {
          previousSlide.style.opacity = '0';

          window.setTimeout(function () {
            removeSlide(previousSlide);
          }, state.config.slideshow.transitionMs + 80);
        }

        setCaption(queued.item.caption, showCaption);
        setDateLabel(queued.item.takenAt);
        setStatus((queued.index + 1) + ' / ' + state.slides.length);
        state.currentIndex = queued.index;
        state.currentAssetId = queued.item.id;
        state.activeSlide = queued.slide;
        state.queuedSlide = null;
        app.className = 'app';
        primeNextSlide();
        scheduleNextAdvance();
      }, 30);
    }, 30);
  }

  function advanceSlide() {
    if (!state.slides.length) {
      setStatus('No images found in this album.');
      return;
    }

    if (state.queuedSlide) {
      activateQueuedSlide();
      return;
    }

    setStatus('Loading next image…');
    primeNextSlide();

    window.setTimeout(function () {
      if (state.queuedSlide) {
        activateQueuedSlide();
      } else {
        advanceSlide();
      }
    }, 250);
  }

  function startSlideshow() {
    if (state.timerId) {
      window.clearTimeout(state.timerId);
    }

    state.queuedSlide = null;
    state.pendingIndex = -1;
    primeNextSlide();
    advanceSlide();
  }

  function applyConfig(config) {
    state.config = config;
    app.style.backgroundColor = config.slideshow.background;
    setCaption('', !!config.slideshow.showCaption);
  }

  function loadAlbum(forceRefresh) {
    var target = '/api/album';

    if (forceRefresh) {
      target += '?refresh=1';
    }

    xhrGet(target, function (error, text) {
      var data;

      if (error) {
        setStatus('Album request failed: ' + error.message);
        return;
      }

      data = JSON.parse(text);
      state.album = data;
      data = buildQueue(data.assets);
      state.slides = data.slides;
      state.currentIndex = data.currentIndex;

      setStatus(state.slides.length + ' images loaded');

      if (state.currentIndex === -1) {
        startSlideshow();
      }
    });
  }

  function loadConfig() {
    xhrGet('/api/config', function (error, text) {
      var data;

      if (error) {
        setStatus('Config request failed: ' + error.message);
        return;
      }

      data = JSON.parse(text);
      applyConfig(data);
      loadAlbum(true);

      if (state.refreshId) {
        window.clearInterval(state.refreshId);
      }

      state.refreshId = window.setInterval(function () {
        loadAlbum(true);
      }, state.config.slideshow.refreshMinutes * 60 * 1000);
    });
  }

  loadConfig();
}());
