(function () {
  var app = document.getElementById('app');
  var slidesEl = document.getElementById('slides');
  var dateLabelEl = document.getElementById('date-label');

  var state = {
    config: null,
    album: null,
    slides: [],
    currentIndex: -1,
    activeSlide: null,
    timerId: null,
    refreshId: null
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

  function showSlide(index) {
    var item;
    var nextUrl;
    var showCaption;
    var slideParts;
    var previousSlide;

    if (!state.slides.length) {
      setStatus('No images found in this album.');
      return;
    }

    item = state.slides[index];
    nextUrl = '/image/' + encodeURIComponent(item.id);
    showCaption = !!state.config.slideshow.showCaption;
    slideParts = createSlide(nextUrl);
    previousSlide = state.activeSlide;

    if (previousSlide) {
      previousSlide.style.zIndex = '1';
    }

    slideParts.root.style.zIndex = '2';
    slidesEl.appendChild(slideParts.root);
    forceReflow(slideParts.root);

    slideParts.image.onload = function () {
      forceReflow(slideParts.root);
      slideParts.root.style.opacity = '0';

      window.setTimeout(function () {
        forceReflow(slideParts.root);

        window.setTimeout(function () {
          slideParts.root.style.opacity = '1';

          if (previousSlide) {
            previousSlide.style.opacity = '0';

            window.setTimeout(function () {
              removeSlide(previousSlide);
            }, state.config.slideshow.transitionMs + 80);
          }

          state.activeSlide = slideParts.root;
        }, 30);
      }, 30);
    };

    slideParts.image.onerror = function () {
      removeSlide(slideParts.root);
      setStatus('Could not load image. Moving on…');
      window.setTimeout(nextSlide, 1000);
    };

    slideParts.image.src = nextUrl;
    setCaption(item.caption, showCaption);
    setDateLabel(item.takenAt);
    setStatus((index + 1) + ' / ' + state.slides.length);
    state.currentIndex = index;
    app.className = 'app';
  }

  function nextSlide() {
    var nextIndex = state.currentIndex + 1;

    if (!state.slides.length) {
      return;
    }

    if (nextIndex >= state.slides.length) {
      nextIndex = 0;

      if (state.config.slideshow.shuffle) {
        state.slides = shuffle(state.slides);
      }
    }

    showSlide(nextIndex);
  }

  function startSlideshow() {
    if (state.timerId) {
      window.clearInterval(state.timerId);
    }

    nextSlide();
    state.timerId = window.setInterval(nextSlide, state.config.slideshow.slideSeconds * 1000);
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
      state.slides = data.assets.slice(0);

      if (state.config.slideshow.shuffle) {
        state.slides = shuffle(state.slides);
      }

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
