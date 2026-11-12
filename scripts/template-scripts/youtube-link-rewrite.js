// Augment YouTube article links with an inline embed and an app deep link.
(function () {
    const APP_LINK_LABEL = "Open in extension.app";
    const APP_URL_PREFIX = "https://vid.thechels.uk/?v=";
    // YouTube rejects embeds without a referrer (Error 153), and NNW sends none,
    // so embed via a hosted wrapper page that supplies one.
    const EMBED_URL_PREFIX = "https://embed.thechels.uk/?v=";
    const EMBED_READY_MESSAGE = "thechels-embed-ready";
    const EMBED_TIMEOUT_MS = 10000;
    const PROCESSED_ATTRIBUTE = "data-youtube-enhanced";
    const YOUTUBE_HOSTNAMES = [
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
        // NetNewsWire 7.3 embeds feed videos from here (see adoptFeedVideos).
        "youtube-nocookie.com",
        "www.youtube-nocookie.com",
    ];
    // NetNewsWire 7.3 puts the feed's videos in its primary media and enclosures blocks as bare iframes.
    // Never write those template tags here: this script is inlined into the template, and NNW finds them anywhere.
    const FEED_PRIMARY_VIDEO_SELECTOR = ".nnw-primary-media .nnw-enclosure-video > iframe[src]";
    const FEED_ENCLOSURE_VIDEO_SELECTOR = ".nnw-enclosures .nnw-enclosure-video > iframe[src]";
    const YOUTUBE_PATH_PREFIXES = ["/shorts/", "/live/", "/embed/"];
    // Plain-text YouTube URLs, with or without a scheme (e.g. Bluesky feeds).
    const YOUTUBE_TEXT_PATTERN =
        /(?:https?:\/\/)?(?:(?:www|m|music)\.)?(?:youtube\.com|youtu\.be)\/[^\s<>"']+/gi;
    const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/;

    function isYouTubeHostname(hostname) {
        return YOUTUBE_HOSTNAMES.includes(hostname);
    }

    function createVideoInfo(videoId) {
        if (!isValidVideoId(videoId || "")) {
            return null;
        }

        return {
            videoId,
            canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        };
    }

    function isValidVideoId(videoId) {
        return /^[A-Za-z0-9_-]{11}$/.test(videoId);
    }

    function getVideoInfo(urlString) {
        let url;

        try {
            url = new URL(urlString);
        } catch {
            return null;
        }

        const pathParts = url.pathname.split("/").filter(Boolean);

        if (url.hostname === "youtu.be") {
            return createVideoInfo(pathParts[0]);
        }

        if (!isYouTubeHostname(url.hostname)) {
            return null;
        }

        if (url.pathname === "/watch") {
            return createVideoInfo(url.searchParams.get("v"));
        }

        if (YOUTUBE_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
            return createVideoInfo(pathParts[1]);
        }

        return null;
    }

    function toAbsoluteUrl(urlString) {
        return /^https?:\/\//i.test(urlString) ? urlString : `https://${urlString}`;
    }

    // Turn plain-text YouTube URLs into links so they can be embedded
    // (and picked up by linker.js as references).
    function linkifyYouTubeText(bodyContainer) {
        const walker = document.createTreeWalker(bodyContainer, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                return node.parentElement?.closest("a, code, pre, script, style")
                    ? NodeFilter.FILTER_REJECT
                    : NodeFilter.FILTER_ACCEPT;
            },
        });

        const textNodes = [];

        while (walker.nextNode()) {
            textNodes.push(walker.currentNode);
        }

        textNodes.forEach((textNode) => {
            const text = textNode.textContent;
            const pattern = new RegExp(YOUTUBE_TEXT_PATTERN.source, "gi");
            const fragment = document.createDocumentFragment();
            let lastIndex = 0;
            let match;

            while ((match = pattern.exec(text)) !== null) {
                const start = match.index;

                // Skip matches that are part of a longer word or URL (e.g. "notyoutube.com").
                if (start > 0 && /[\w.\/@-]/.test(text[start - 1])) {
                    continue;
                }

                const rawUrl = match[0].replace(TRAILING_PUNCTUATION, "");
                const href = toAbsoluteUrl(rawUrl);

                if (!getVideoInfo(href)) {
                    continue;
                }

                fragment.append(text.slice(lastIndex, start));

                const anchor = document.createElement("a");
                anchor.href = href;
                anchor.textContent = rawUrl;
                fragment.append(anchor);

                lastIndex = start + rawUrl.length;
            }

            if (lastIndex === 0) {
                return;
            }

            fragment.append(text.slice(lastIndex));
            textNode.replaceWith(fragment);
        });
    }

    function insertEmbed(anchor, embedBlock) {
        const bodyContainer = document.querySelector("#bodyContainer");
        const block = anchor.closest("p, figure, div, li, blockquote");

        // Plain-text bodies have no block around the link: add the embed at the end.
        if (bodyContainer && block === bodyContainer) {
            bodyContainer.appendChild(embedBlock);
            return;
        }

        let target = block || anchor;

        // Keep several embeds after the same block in document order.
        while (target.nextElementSibling?.classList.contains("nnw-youtube-embed")) {
            target = target.nextElementSibling;
        }

        target.insertAdjacentElement("afterend", embedBlock);
    }

    function createThumbnailLink(videoInfo, title) {
        const link = document.createElement("a");
        link.className = "nnw-youtube-fallback";
        link.href = videoInfo.canonicalUrl;
        link.title = title;
        link.style.display = "block";

        const image = document.createElement("img");
        image.src = `https://i.ytimg.com/vi/${videoInfo.videoId}/hqdefault.jpg`;
        image.alt = title;
        image.style.display = "block";
        image.style.width = "100%";
        image.style.height = "100%";
        image.style.objectFit = "cover";

        link.appendChild(image);
        return link;
    }

    // If the wrapper page never reports in, swap the iframe for a thumbnail link.
    function watchForEmbedFailure(iframe, videoInfo) {
        let ready = false;

        window.addEventListener("message", (event) => {
            if (
                event.source === iframe.contentWindow &&
                event.data?.type === EMBED_READY_MESSAGE
            ) {
                ready = true;
            }
        });

        function startTimer() {
            setTimeout(() => {
                if (!ready && iframe.isConnected) {
                    iframe.replaceWith(createThumbnailLink(videoInfo, iframe.title));
                }
            }, EMBED_TIMEOUT_MS);
        }

        // The iframe is lazy-loaded, so only start timing once it is on screen.
        if (!("IntersectionObserver" in window)) {
            startTimer();
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                observer.disconnect();
                startTimer();
            }
        });
        observer.observe(iframe);
    }

    function createEmbedBlock(videoInfo, anchorText) {
        const wrapper = document.createElement("div");
        wrapper.className = "nnw-youtube-embed";

        const frame = document.createElement("div");
        frame.className = "nnw-youtube-frame";

        const iframe = document.createElement("iframe");
        iframe.className = "nnw-youtube-iframe";
        iframe.src = `${EMBED_URL_PREFIX}${encodeURIComponent(videoInfo.videoId)}`;
        iframe.title = anchorText || "Embedded YouTube video";
        iframe.loading = "lazy";
        iframe.allow =
            "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
        iframe.referrerPolicy = "strict-origin-when-cross-origin";
        iframe.allowFullscreen = true;

        frame.appendChild(iframe);
        watchForEmbedFailure(iframe, videoInfo);

        const actions = document.createElement("div");
        actions.className = "nnw-youtube-actions";

        const appLink = document.createElement("a");
        appLink.className = "nnw-youtube-app-link";
        appLink.href = `${APP_URL_PREFIX}${encodeURIComponent(videoInfo.canonicalUrl)}`;
        appLink.textContent = APP_LINK_LABEL;
        actions.appendChild(appLink);

        wrapper.appendChild(frame);
        wrapper.appendChild(actions);

        return wrapper;
    }

    function getBodyVideoAnchors() {
        const bodyContainer = document.querySelector("#bodyContainer");

        if (!bodyContainer) {
            return [];
        }

        linkifyYouTubeText(bodyContainer);

        return Array.from(bodyContainer.querySelectorAll("a[href]")).filter(
            (anchor) => getVideoInfo(anchor.getAttribute("href") || ""),
        );
    }

    function getTitleVideoAnchor() {
        const titleAnchor = document.querySelector(".articleTitle a[href]");

        if (!titleAnchor) {
            return null;
        }

        return getVideoInfo(titleAnchor.getAttribute("href") || "")
            ? titleAnchor
            : null;
    }

    function getCandidateAnchors() {
        const bodyVideoAnchors = getBodyVideoAnchors();

        if (bodyVideoAnchors.length > 0) {
            return bodyVideoAnchors;
        }

        const titleVideoAnchor = getTitleVideoAnchor();

        return titleVideoAnchor ? [titleVideoAnchor] : [];
    }

    // Replace each NetNewsWire YouTube iframe with our embed (its own iframe sends no referrer, so YouTube may
    // refuse it), or remove it when that video is already embedded, so a video never shows twice.
    function adoptFeedVideos(selector, embeddedVideoIds) {
        document.querySelectorAll(selector).forEach((iframe) => {
            const videoInfo = getVideoInfo(iframe.getAttribute("src") || "");

            if (!videoInfo) {
                return;
            }

            if (embeddedVideoIds.has(videoInfo.videoId)) {
                const enclosure = iframe.closest(".nnw-enclosure");
                const group = enclosure?.parentElement;
                enclosure?.remove();

                // Drop an emptied enclosures list so the theme's :empty rule hides its slot.
                if (group?.classList.contains("nnw-enclosures") && !group.firstElementChild) {
                    group.remove();
                }
                return;
            }

            embeddedVideoIds.add(videoInfo.videoId);
            const title = document.querySelector(".articleTitle a")?.textContent.trim();
            iframe.replaceWith(createEmbedBlock(videoInfo, title));
        });
    }

    function rewriteYouTubeLinks() {
        const embeddedVideoIds = new Set();

        // Document order: the primary video sits above the body, the other enclosures below it.
        adoptFeedVideos(FEED_PRIMARY_VIDEO_SELECTOR, embeddedVideoIds);

        const anchors = getCandidateAnchors();

        anchors.forEach((anchor) => {
            if (anchor.hasAttribute(PROCESSED_ATTRIBUTE)) {
                return;
            }

            anchor.setAttribute(PROCESSED_ATTRIBUTE, "true");

            const videoInfo = getVideoInfo(anchor.getAttribute("href") || "");

            // One embed per video, even when a post links it more than once.
            if (!videoInfo || embeddedVideoIds.has(videoInfo.videoId)) {
                return;
            }

            embeddedVideoIds.add(videoInfo.videoId);
            insertEmbed(anchor, createEmbedBlock(videoInfo, anchor.textContent.trim()));
        });

        adoptFeedVideos(FEED_ENCLOSURE_VIDEO_SELECTOR, embeddedVideoIds);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", rewriteYouTubeLinks);
    } else {
        rewriteYouTubeLinks();
    }
})();
