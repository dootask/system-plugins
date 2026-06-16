<template>
    <div
        class="okr-user-select-field flex items-center flex-wrap"
        :class="disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'"
        @click="handleOpen">
        <div
            v-for="u in resolvedUsers"
            :key="u.userid"
            class="flex items-center shrink-0"
            :class="avatarName ? 'mr-12' : 'mr-2'">
            <n-avatar round :size="avatarSize" :src="u.userimg" />
            <span v-if="avatarName" class="ml-8 text-14 text-text-li">{{ u.nickname }}</span>
        </div>
        <div
            v-if="showAdd"
            class="flex items-center justify-center rounded-full border border-dashed border-[#C0C4CC] text-[#C0C4CC] shrink-0 leading-none"
            :style="{ width: avatarSize + 'px', height: avatarSize + 'px' }">
            <span :style="{ fontSize: Math.round(avatarSize * 0.6) + 'px' }">+</span>
        </div>
        <span
            v-else-if="!resolvedUsers.length && placeholder"
            class="text-14 text-[#C0C4CC]">{{ placeholder }}</span>
    </div>
</template>

<script setup lang="ts">
import { selectUsers, fetchUserBasic } from "@dootask/tools"

/**
 * 选人字段：替代原本借主程序实例渲染的 UserSelect。
 * 展示已选用户头像（fetchUserBasic 拉取），点击调用 selectUsers() 打开主程序选人弹窗。
 */
const props = defineProps({
    value: {
        type: Array as () => number[],
        default: () => [],
    },
    title: {
        type: String,
        default: "",
    },
    placeholder: {
        type: String,
        default: "",
    },
    // 0 表示不限制
    multipleMax: {
        type: Number,
        default: 0,
    },
    showDisable: {
        type: Boolean,
        default: false,
    },
    avatarSize: {
        type: Number,
        default: 22,
    },
    // 头像旁是否显示昵称（单选场景）
    avatarName: {
        type: Boolean,
        default: false,
    },
    // 空选时是否显示「+」添加图标
    addIcon: {
        type: Boolean,
        default: true,
    },
    disabled: {
        type: Boolean,
        default: false,
    },
})

const emit = defineEmits(["update:value", "change"])

const resolvedUsers = ref<any[]>([])
const userCache = new Map<number, any>()

const ids = computed(() => (props.value || []).map(Number).filter((v) => v && v !== 0))

const showAdd = computed(() => props.addIcon && resolvedUsers.value.length === 0)

const resolve = async () => {
    const need = ids.value.filter((id) => !userCache.has(id))
    if (need.length) {
        try {
            const list = await fetchUserBasic(need)
            ;(list || []).forEach((u) => userCache.set(u.userid, u))
        } catch {
            // 拉取失败时用占位信息兜底
        }
    }
    resolvedUsers.value = ids.value.map(
        (id) => userCache.get(id) || { userid: id, nickname: "", userimg: "" }
    )
}

watch(ids, resolve, { immediate: true, deep: true })

const handleOpen = async () => {
    if (props.disabled) {
        return
    }
    try {
        const result = await selectUsers({
            value: ids.value,
            title: props.title || undefined,
            multipleMax: props.multipleMax || undefined,
            showDisable: props.showDisable || undefined,
        })
        // 空数组视为取消（与官方范式一致），不覆盖原值
        if (Array.isArray(result) && result.length) {
            emit("update:value", result)
            emit("change", result)
        }
    } catch {
        // 取消选择或非 micro-app 环境，忽略
    }
}
</script>
