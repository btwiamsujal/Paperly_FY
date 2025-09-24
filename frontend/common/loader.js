(function(){
  // Inject overlay
  var overlay = document.createElement('div');
  overlay.className = 'loader-overlay visible'; // start visible to avoid white flash
  overlay.innerHTML = '<div class="loader-box">\
    <div class="loader-spinner"></div>\
    <div class="loader-text">Loading…</div>\
  </div>';

  var pending = 1; // page boot pending
  function update() {
    if (pending > 0) overlay.classList.add('visible');
    else overlay.classList.remove('visible');
  }

  window.Loader = {
    show: function(){ pending++; update(); },
    hide: function(){ pending = Math.max(0, pending-1); update(); },
    _forceHide: function(){ pending = 0; update(); }
  };

  // Insert early to avoid white screen
  if (document.body) document.body.appendChild(overlay);
  else document.addEventListener('DOMContentLoaded', function(){ document.body.appendChild(overlay); });

  // Hide after full load
  window.addEventListener('load', function(){
    pending = Math.max(0, pending-1);
    update();
  });

  // Safety timeout (in case 'load' never fires)
  setTimeout(function(){ if (pending > 0) { pending = 0; update(); } }, 10000);
})();
