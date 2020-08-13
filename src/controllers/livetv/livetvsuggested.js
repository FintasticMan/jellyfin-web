import layoutManager from 'layoutManager';
import * as userSettings from 'userSettings';
import inputManager from 'inputManager';
import loading from 'loading';
import globalize from 'globalize';
import * as mainTabsManager from 'mainTabsManager';
import cardBuilder from 'cardBuilder';
import imageLoader from 'imageLoader';
import 'scrollStyles';
import 'emby-itemscontainer';
import 'emby-tabs';
import 'emby-button';

function enableScrollX() {
    return !layoutManager.desktop;
}

function getBackdropShape() {
    if (enableScrollX()) {
        return 'overflowBackdrop';
    }
    return 'backdrop';
}

function getPortraitShape() {
    if (enableScrollX()) {
        return 'overflowPortrait';
    }
    return 'portrait';
}

function getLimit() {
    if (enableScrollX()) {
        return 12;
    }

    return 9;
}

function loadRecommendedPrograms(page) {
    loading.show();
    let limit = getLimit();

    if (enableScrollX()) {
        limit *= 2;
    }

    ApiClient.getLiveTvRecommendedPrograms({
        userId: Dashboard.getCurrentUserId(),
        IsAiring: true,
        limit: limit,
        ImageTypeLimit: 1,
        EnableImageTypes: 'Primary,Thumb,Backdrop',
        EnableTotalRecordCount: false,
        Fields: 'ChannelInfo,PrimaryImageAspectRatio'
    }).then(function (result) {
        renderItems(page, result.Items, 'activeProgramItems', 'play', {
            showAirDateTime: false,
            showAirEndTime: true
        });
        loading.hide();

        import('autoFocuser').then(({default: autoFocuser}) => {
            autoFocuser.autoFocus(page);
        });
    });
}

function reload(page, enableFullRender) {
    if (enableFullRender) {
        loadRecommendedPrograms(page);
        ApiClient.getLiveTvPrograms({
            userId: Dashboard.getCurrentUserId(),
            HasAired: false,
            limit: getLimit(),
            IsMovie: false,
            IsSports: false,
            IsKids: false,
            IsNews: false,
            IsSeries: true,
            EnableTotalRecordCount: false,
            Fields: 'ChannelInfo,PrimaryImageAspectRatio',
            EnableImageTypes: 'Primary,Thumb'
        }).then(function (result) {
            renderItems(page, result.Items, 'upcomingEpisodeItems');
        });
        ApiClient.getLiveTvPrograms({
            userId: Dashboard.getCurrentUserId(),
            HasAired: false,
            limit: getLimit(),
            IsMovie: true,
            EnableTotalRecordCount: false,
            Fields: 'ChannelInfo',
            EnableImageTypes: 'Primary,Thumb'
        }).then(function (result) {
            renderItems(page, result.Items, 'upcomingTvMovieItems', null, {
                shape: getPortraitShape(),
                preferThumb: null,
                showParentTitle: false
            });
        });
        ApiClient.getLiveTvPrograms({
            userId: Dashboard.getCurrentUserId(),
            HasAired: false,
            limit: getLimit(),
            IsSports: true,
            EnableTotalRecordCount: false,
            Fields: 'ChannelInfo,PrimaryImageAspectRatio',
            EnableImageTypes: 'Primary,Thumb'
        }).then(function (result) {
            renderItems(page, result.Items, 'upcomingSportsItems');
        });
        ApiClient.getLiveTvPrograms({
            userId: Dashboard.getCurrentUserId(),
            HasAired: false,
            limit: getLimit(),
            IsKids: true,
            EnableTotalRecordCount: false,
            Fields: 'ChannelInfo,PrimaryImageAspectRatio',
            EnableImageTypes: 'Primary,Thumb'
        }).then(function (result) {
            renderItems(page, result.Items, 'upcomingKidsItems');
        });
        ApiClient.getLiveTvPrograms({
            userId: Dashboard.getCurrentUserId(),
            HasAired: false,
            limit: getLimit(),
            IsNews: true,
            EnableTotalRecordCount: false,
            Fields: 'ChannelInfo,PrimaryImageAspectRatio',
            EnableImageTypes: 'Primary,Thumb'
        }).then(function (result) {
            renderItems(page, result.Items, 'upcomingNewsItems', null, {
                showParentTitleOrTitle: true,
                showTitle: false,
                showParentTitle: false
            });
        });
    }
}

function renderItems(page, items, sectionClass, overlayButton, cardOptions) {
    const html = cardBuilder.getCardsHtml(Object.assign({
        items: items,
        preferThumb: 'auto',
        inheritThumb: false,
        shape: enableScrollX() ? 'autooverflow' : 'auto',
        defaultShape: getBackdropShape(),
        showParentTitle: true,
        showTitle: true,
        centerText: true,
        coverImage: true,
        overlayText: false,
        lazy: true,
        overlayPlayButton: overlayButton === 'play',
        overlayMoreButton: overlayButton === 'more',
        overlayInfoButton: overlayButton === 'info',
        allowBottomPadding: !enableScrollX(),
        showAirTime: true,
        showAirDateTime: true
    }, cardOptions || {}));
    const elem = page.querySelector('.' + sectionClass);
    elem.innerHTML = html;
    imageLoader.lazyChildren(elem);
}

function getTabs() {
    return [{
        name: globalize.translate('Programs')
    }, {
        name: globalize.translate('Guide')
    }, {
        name: globalize.translate('Channels')
    }, {
        name: globalize.translate('Recordings')
    }, {
        name: globalize.translate('Schedule')
    }, {
        name: globalize.translate('Series')
    }];
}

function setScrollClasses(elem, scrollX) {
    if (scrollX) {
        elem.classList.add('hiddenScrollX');

        if (layoutManager.tv) {
            elem.classList.add('smoothScrollX');
        }

        elem.classList.add('scrollX');
        elem.classList.remove('vertical-wrap');
    } else {
        elem.classList.remove('hiddenScrollX');
        elem.classList.remove('smoothScrollX');
        elem.classList.remove('scrollX');
        elem.classList.add('vertical-wrap');
    }
}

function getDefaultTabIndex(folderId) {
    if (userSettings.get('landing-' + folderId) === 'guide') {
        return 1;
    }

    return 0;
}

export default function (view, params) {
    function enableFullRender() {
        return new Date().getTime() - lastFullRender > 3e5;
    }

    function onBeforeTabChange(evt) {
        preLoadTab(view, parseInt(evt.detail.selectedTabIndex));
    }

    function onTabChange(evt) {
        const previousTabController = tabControllers[parseInt(evt.detail.previousIndex)];

        if (previousTabController && previousTabController.onHide) {
            previousTabController.onHide();
        }

        loadTab(view, parseInt(evt.detail.selectedTabIndex));
    }

    function getTabContainers() {
        return view.querySelectorAll('.pageTabContent');
    }

    function initTabs() {
        mainTabsManager.setTabs(view, currentTabIndex, getTabs, getTabContainers, onBeforeTabChange, onTabChange);
    }

    function getTabController(page, index, callback) {
        let depends;

        // TODO int is a little hard to read
        switch (index) {
            case 0:
                depends = 'controllers/livetv/livetvsuggested';
                break;

            case 1:
                depends = 'controllers/livetv/livetvguide';
                break;

            case 2:
                depends = 'controllers/livetv/livetvchannels';
                break;

            case 3:
                depends = 'controllers/livetv/livetvrecordings';
                break;

            case 4:
                depends = 'controllers/livetv/livetvschedule';
                break;

            case 5:
                depends = 'controllers/livetv/livetvseriestimers';
                break;
        }

        import(depends).then(({default: controllerFactory}) => {
            let tabContent;

            if (index === 0) {
                tabContent = view.querySelector(`.pageTabContent[data-index="${index}"]`);
                self.tabContent = tabContent;
            }

            let controller = tabControllers[index];

            if (!controller) {
                tabContent = view.querySelector(`.pageTabContent[data-index="${index}"]`);

                if (index === 0) {
                    controller = self;
                } else if (index === 6) {
                    controller = new controllerFactory(view, tabContent, {
                        collectionType: 'livetv'
                    });
                } else {
                    controller = new controllerFactory(view, params, tabContent);
                }

                tabControllers[index] = controller;

                if (controller.initTab) {
                    controller.initTab();
                }
            }

            callback(controller);
        });
    }

    function preLoadTab(page, index) {
        getTabController(page, index, function (controller) {
            if (renderedTabs.indexOf(index) === -1 && controller.preRender) {
                controller.preRender();
            }
        });
    }

    function loadTab(page, index) {
        currentTabIndex = index;
        getTabController(page, index, function (controller) {
            initialTabIndex = null;

            if (renderedTabs.indexOf(index) === -1) {
                if (index === 1) {
                    renderedTabs.push(index);
                }

                controller.renderTab();
            } else if (controller.onShow) {
                controller.onShow();
            }

            currentTabController = controller;
        });
    }

    function onInputCommand(evt) {
        if (evt.detail.command === 'search') {
            evt.preventDefault();
            Dashboard.navigate('search.html?collectionType=livetv');
        }
    }

    let isViewRestored;
    const self = this;
    let currentTabIndex = parseInt(params.tab || getDefaultTabIndex('livetv'));
    let initialTabIndex = currentTabIndex;
    let lastFullRender = 0;
    [].forEach.call(view.querySelectorAll('.sectionTitleTextButton-programs'), function (link) {
        const href = link.href;

        if (href) {
            link.href = href + '&serverId=' + ApiClient.serverId();
        }
    });

    self.initTab = function () {
        const tabContent = view.querySelector('.pageTabContent[data-index="0"]');
        const containers = tabContent.querySelectorAll('.itemsContainer');

        for (let i = 0, length = containers.length; i < length; i++) {
            setScrollClasses(containers[i], enableScrollX());
        }
    };

    self.renderTab = function () {
        const tabContent = view.querySelector('.pageTabContent[data-index="0"]');

        if (enableFullRender()) {
            reload(tabContent, true);
            lastFullRender = new Date().getTime();
        } else {
            reload(tabContent);
        }
    };

    let currentTabController;
    const tabControllers = [];
    const renderedTabs = [];
    view.addEventListener('viewbeforeshow', function (evt) {
        isViewRestored = evt.detail.isRestored;
        initTabs();
    });
    view.addEventListener('viewshow', function (evt) {
        isViewRestored = evt.detail.isRestored;

        if (!isViewRestored) {
            mainTabsManager.selectedTabIndex(initialTabIndex);
        }

        inputManager.on(window, onInputCommand);
    });
    view.addEventListener('viewbeforehide', function () {
        if (currentTabController && currentTabController.onHide) {
            currentTabController.onHide();
        }

        inputManager.off(window, onInputCommand);
    });
    view.addEventListener('viewdestroy', function () {
        tabControllers.forEach(function (tabController) {
            if (tabController.destroy) {
                tabController.destroy();
            }
        });
    });
}
