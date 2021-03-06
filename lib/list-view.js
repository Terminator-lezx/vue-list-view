import throttle from 'lodash/throttle';
import fastdom from 'fastdom';
import Vue from 'vue';

const INNER_HEIGHT = window.innerHeight;
const DIRECTION_UP = 0;
const DIRECTION_DOWN = 1;
/**
 * ListView component constructor
 *
 * @param itemComponent - The component used as list item in v-for
 * @returns listView vue component object
 * @constructor
 */
export default function ListView(itemComponent = {template: ''}) {
    /* Force setting itemComponent's prop */
    itemComponent.props = {item: {type: Object}};
    /* Force setting replace to false to use keep-alive (fragment instances are not supported by keep-alive)*/
    itemComponent.replace = false;
    return {
        template: `
            <div class="list-view">
                <slot name="list-start"></slot>
                <div v-for="item in items" track-by="$index" class="list-view-item" :style="{height: placeholders[$index] + 'px'}">
                    <component :is="visibility[$index] ? 'list-view-item' : ''" :item="item" keep-alive></component>
                </div>
                <slot name="list-end"></slot>
            </div>
        `,
        props: {
            items: {
                type: Array,
                required: true
            },
            preloadScreens: {
                type: Number,
                default: 6
            },
            scrollInside: {
                type: Boolean,
                default: false
            },
            loadMore: {
                type: Function
            }
        },
        components: {
            listViewItem: itemComponent
        },
        data: () => ({
            placeholders: [],
            visibility: [],
            scrollHeight: 0,
            scrollTop: 0,
            preloadHeight: 0
        }),
        ready() {
            this.preloadHeight = this.preloadScreens * INNER_HEIGHT;
            if (!this.scrollInside) {
                window.addEventListener('scroll', this.scrollHandler)
            } else {
                this.$el.style.overflowY = 'auto';
                this.$el.style.height = '100%';
                this.$el.addEventListener('scroll', this.scrollHandler)
            }
        },
        beforeDestroy() {
            !this.scrollInside && window.removeEventListener('scroll', this.scrollHandler)
        },
        methods: {
            scrollHandler: throttle(function () {
                var el = this.$el;
                el && fastdom.measure(() => {
                    if (!el) return;
                    /* Check scrolling up or down */
                    var oldScrollTop = this.scrollTop;
                    var newScrollTop = this.scrollInside ? el.scrollTop : window.scrollY;
                    var direction = oldScrollTop > newScrollTop ? DIRECTION_UP : DIRECTION_DOWN;
                    this.scrollTop = newScrollTop;

                    /* Check if scrolled to end */
                    if (INNER_HEIGHT + newScrollTop >= this.scrollHeight) {
                        if (this.loadMore) {
                            this.loadMore();
                        }
                        /* Note: $dispatch is deprecated in vue 2.0 */
                        else if (this.$dispatch) {
                            this.$dispatch('list-view:scrolled-to-end');
                        }
                    }

                    this.checkVisibility(direction);
                })
            }, 1000),
            /* GC invisible items and Restore visible items if necessary */
            checkVisibility(direction) {
                if (!this.$el) return;
                var preloadHeight = this.preloadHeight;
                var els = this.$el.querySelectorAll('.list-view-item');
                var visibility = this.visibility, placeholders = this.placeholders;
                var scrollTop = this.scrollTop;

                /* If we don't know the scrolling direction, we must check all the items */
                var checkStart = 0, checkEnd = visibility.length - 1;

                /* Whether to skip checking */
                var skip = false;

                /* If scrolling up, we only need to check visible items plus those before them */
                if (direction == DIRECTION_UP) {
                    checkEnd = visibility.lastIndexOf(true);
                    /* using a reversed loop for efficiency */
                    for (let i = checkEnd; i >= checkStart; i--) {
                        fastdom.measure(() => {
                            if (skip) {
                                Vue.set(visibility, i, false);
                            } else if (els[i]) {
                                checkElem(i);
                                if (i < checkEnd && !visibility[i] && visibility[i + 1]) skip = true;
                            }
                        });
                    }
                } else {
                    /* If scrolling down, we only need to check visible items plus those after them */
                    if (direction == DIRECTION_DOWN) checkStart = visibility.indexOf(true);
                    for (let i = checkStart; i <= checkEnd; i++) {
                        fastdom.measure(() => {
                            if (skip) {
                                Vue.set(visibility, i, false);
                            } else if (els[i]) {
                                checkElem(i);
                                if (i > checkStart && !visibility[i] && visibility[i - 1]) skip = true;
                            }
                        });
                    }
                }

                function checkElem(i) {
                    var top = els[i].offsetTop - scrollTop;
                    var bottom = top + placeholders[i];
                    visibility[i] = bottom > -preloadHeight && top < preloadHeight;
                }
            }
        },
        watch: {
            items: {
                immediate: true,
                handler(items, oldItems) {
                    var placeholders = this.placeholders,
                        visibility = this.visibility,
                        shrinked = oldItems && (oldItems.length > items.length);

                    /* Re-initialize visibility table and bypass vue's watcher */
                    for (let i = 0, len = items.length; i < len; i++) {
                        Vue.set(visibility, i, true);
                    }

                    /* Wait for vue to update dom */
                    this.$nextTick(() => {
                        /* Now vue has re-rendered the list and dom's ready */
                        /* Cache scrollHeight */
                        fastdom.measure(() => this.$el && (this.scrollHeight = this.$el.scrollHeight));

                        /* Update elements' heights(placeholders) */
                        var els = this.$el.querySelectorAll('.list-view-item');
                        for (let i = 0, len = els.length; i < len; i++) {
                            fastdom.measure(() => {
                                /* Skip if already measured */
                                if (els[i].style.cssText) return;
                                /* Measure element height */
                                Vue.set(placeholders, i, els[i].offsetHeight || null);
                                if (i == len - 1) {
                                    /**
                                     * Since items typically updated after scrolling to end,
                                     * and new contents are appended at the end, we only need to check downwards
                                     */
                                    this.checkVisibility(!shrinked && DIRECTION_DOWN);
                                }
                            })
                        }
                    });
                }
            }
        }
    };
}