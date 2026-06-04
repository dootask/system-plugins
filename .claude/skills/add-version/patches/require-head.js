
;(function(window) {
    try {
        window.localStorage.removeItem('ui-theme-id')
    } catch (e) {}
    //
    if (window.parent) {
        window._toolbarClick = function(el, action) {
            window.parent.postMessage({
                source: 'onlyoffice',
                action: action,
                rect: el.getBoundingClientRect()
            }, "*");
        };
        window._toolbarInter = setInterval(function() {
            if (typeof $ === "function") {
                var toolbar = $("#toolbar");
                if (toolbar.find(".hedset").length > 0) {
                    clearInterval(window._toolbarInter);
                    window.parent.postMessage({
                        source: 'onlyoffice',
                        action: 'ready',
                    }, "*");
                }
            }
        }, 1000);
        window.addEventListener('message', function(event) {
            if (event.data === "createMenu") {
                var toolbar = $("#toolbar");
                if (toolbar.find(".hedset").length > 0 && toolbar.find("#doo-hedset").length === 0) {
                    var linkSvg = '<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512" style="opacity:0.8;width:17px;vertical-align:middle;color:var(--text-toolbar-header)"><path d="M208 352h-64a96 96 0 010-192h64M304 160h64a96 96 0 010 192h-64M163.29 256h187.42" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="36"></path></svg>';
                    var historySvg = '<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512" style="opacity:0.8;width:17px;vertical-align:middle;color:var(--text-toolbar-header)"><path d="M112.91 128A191.85 191.85 0 0064 254c-1.18 106.35 85.65 193.8 192 194 106.2.2 192-85.83 192-192 0-104.54-83.55-189.61-187.5-192a4.36 4.36 0 00-4.5 4.37V152" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/><path d="M233.38 278.63l-79-113a8.13 8.13 0 0111.32-11.32l113 79a32.5 32.5 0 01-37.25 53.26 33.21 33.21 0 01-8.07-7.94z" fill="currentColor"/></svg>';
                    toolbar.find(".hedset").last().before('<div id="doo-hedset" class="hedset">' +
                        '<div class="btn-slot"><button onclick="_toolbarClick(this, \'link\')" type="button" class="btn btn-header">' + linkSvg + '</button></div>' +
                        '<div class="btn-slot"><button onclick="_toolbarClick(this, \'history\')" type="button" class="btn btn-header">' + historySvg + '</button></div>' +
                        '</div>')
                }
            }
            if (event.data === "disableDownload") {
                document.body.classList.add("disable-download");
                window._disableDownload = setInterval(function() {
                    var downloadBtn = document.getElementById("slot-hbtn-download")
                    if(downloadBtn) {
                        clearInterval(window._disableDownload);
                        document.getElementById("slot-hbtn-download")?.remove()
                        document.getElementById("fm-btn-download")?.remove()
                    }
                }, 1000);
            }
        })
    }
})(window);

