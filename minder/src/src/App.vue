<template>
    <div id="app">
        <Minder ref="mind" v-if="content !== null" v-model="content" :read-only="readonly" @saveData="onChange"/>
    </div>
</template>

<style scoped>
#app {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
}
</style>

<script>
import Vue from 'vue'
import Minder from './Minder'

Vue.use(Minder)

export default {
    data() {
        return {
            content: this.getQueryVariable('type') === 'manual' ? null : {},
            readonly: this.getQueryVariable('readonly') === 'yes'
        }
    },
    mounted() {
        this.postMessage({
            app: 'minder',
            action: 'ready',
        })
        window.addEventListener('message', this.handleMessage)
        document.addEventListener('keydown', this.keySave)
    },
    beforeDestroy() {
        window.removeEventListener('message', this.handleMessage)
        document.removeEventListener('keydown', this.keySave)
    },
    watch: {
        content() {
            this.onChange()
        }
    },
    methods: {
        isJson(obj) {
            return typeof (obj) == "object" && Object.prototype.toString.call(obj).toLowerCase() === "[object object]" && typeof obj.length == "undefined";
        },

        jsonParse(str, defaultVal = undefined) {
            if (str === null) {
                return defaultVal ? defaultVal : {};
            }
            if (typeof str === "object") {
                return str;
            }
            try {
                return JSON.parse(str.replace(/\n/g, "\\n").replace(/\r/g, "\\r"));
            } catch (e) {
                return defaultVal ? defaultVal : {};
            }
        },

        getQueryVariable(variable) {
            let query = window.location.search.substring(1);
            let vars = query.split("&");
            for (let i = 0; i < vars.length; i++) {
                let pair = vars[i].split("=");
                if (pair[0] === variable) {
                    return pair[1];
                }
            }
            return null;
        },

        onChange() {
            this.postMessage({
                app: 'minder',
                action: 'content',
                content: this.content
            })
        },

        postMessage(message, targetOrigin = "*") {
            window.parent?.postMessage(message, targetOrigin);
        },

        handleMessage({data}) {
            if (!this.isJson(data) || data.app !== 'minder') {
                return
            }
            switch (data.action) {
                case "command":
                    if (data.command === 'goCenter') {
                        this.$refs.mind?.goCenter()
                    } else if (data.command === 'removeAllSelected') {
                        this.$refs.mind?.removeAllSelected()
                    } else {
                        this.$refs.mind?.execCommand(data.command, data.value);
                    }
                    break;

                case "export":
                    this.$refs.mind?.exportHandle(data.type, data.name);
                    break;

                case "setContent":
                    this.content = this.isJson(data.content) ? data.content : this.jsonParse(data.content)
                    break;

                case "postContent":
                    this.onChange()
                    break;
            }
        },

        keySave(e) {
            if (e.keyCode === 83 && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                this.postMessage({
                    app: 'minder',
                    action: 'save',
                })
            }
        },
    }
}
</script>
