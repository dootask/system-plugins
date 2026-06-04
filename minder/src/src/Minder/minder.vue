<template>
    <div :id="id" class="container"></div>
</template>

<style scoped>
.container {
    font-family: Arial, Hiragino Sans GB, Microsoft YaHei, WenQuanYi Micro Hei, sans-serif;
}
</style>
<script>
import {generateMixed} from 'vue-kityminder-ggg/src/utils/index.js';
import 'vue-kityminder-ggg/examples/styles/minder.css';
import JSPDF from 'jspdf';

export default {
    name: 'mind-editor',
    props: {
        value: {
            type: Object,
            default: function () {
                return {}
            }
        },
        readOnly: {
            type: Boolean,
            default: false
        },
        id: {
            type: String,
            default: 'minder-component-' + generateMixed(12)
        },
    },
    data() {
        return {
            minder: null,
            bakValue: '',
        };
    },
    methods: {
        execCommand(command, value) {
            if (this.readOnly === true) {
                this.minder.enable();
                this.$nextTick(_ => {
                    this.minder.execCommand(command, value);
                    this.$nextTick(_ => {
                        this.minder.disable();
                    });
                });
            } else {
                this.minder.execCommand(command, value);
            }
        },
        exportHandle(n, filename) {
            filename = filename || (this.value.root.data.text || 'Untitled');
            if (n === 0 || n === 'png') {
                this.minder.exportData('png').then(content => {
                    let element = document.createElement('a');
                    element.setAttribute('href', content);
                    element.setAttribute('download', filename);
                    element.style.display = 'none';
                    document.body.appendChild(element);
                    element.click();
                    document.body.removeChild(element);
                });
            } else if (n === 1 || n === 'pdf') {
                this.minder.exportData('png').then(content => {
                    let doc = new JSPDF();
                    doc.addImage(content, 'PNG', 0, 0, 0, 0);
                    doc.save(`${filename}.pdf`);
                });
            }
        },
        goCenter() {
            this.minder?.execCommand("camera", this.minder.getRoot(), 600);
        },
        removeAllSelected() {
            this.minder?.removeAllSelectedNodes();
        },
        rendData() {
            this.$nextTick(_ => {
                setTimeout(_ => {
                    if (this.minder !== null) {
                        if (this.bakValue == JSON.stringify(this.value)) {
                            return;
                        }
                        this.bakValue = JSON.stringify(this.value);
                        this.minder.importJson(this.value);
                        return;
                    }
                    window.__minderReadOnly = this.readOnly;
                    const Editor = require('./editor');
                    this.minder = window.editor = new Editor(document.getElementById(this.id)).minder;
                    this.bakValue = JSON.stringify(this.value);
                    this.minder.importJson(this.value);
                    if (this.readOnly === true) {
                        this.minder.removeAllSelectedNodes();
                        this.minder.disable();
                        this.minder.execCommand('Hand');
                    }
                    this.$emit('minderHandle', this.minder);
                    this.minder.on('contentchange', _ => {
                        const newJson = this.minder.exportJson();
                        if (this.bakValue == JSON.stringify(newJson)) {
                            return;
                        }
                        this.bakValue = JSON.stringify(newJson);
                        this.$emit('input', newJson);
                    });
                }, 300)
            });
        }
    },
    watch: {
        value: {
            handler: function (newObj) {
                if (typeof newObj !== "object" || newObj === null) {
                    newObj = {
                        root: newObj,
                        theme: "fresh-blue",
                        template: "default",
                    };
                }
                if (typeof newObj.root !== "object" || newObj.root === null || newObj.root.length == 0) {
                    newObj.root = {
                        data: {
                            id: generateMixed(12),
                            text: 'Default',
                        },
                        children: []
                    }
                }
                if (typeof newObj.theme !== "string") {
                    newObj.theme = "fresh-blue";
                }
                if (typeof newObj.template !== "string") {
                    newObj.template = "default";
                }
                this.rendData();
            },
            deep: true,
            immediate: true
        }
    }
};
</script>
