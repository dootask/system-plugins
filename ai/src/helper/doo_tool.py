"""
doo CLI 执行工具

把 DooTask 的 `doo` 命令行作为一个受控工具暴露给模型，替代逐个挂载的 MCP 工具。
模型给出 doo 的 argv，工具直接以子进程执行二进制（绝不经 shell），并注入当前用户的
鉴权环境（DOO_TOKEN）与页面会话（DOO_SESSION=fd）。所有操作都在该用户权限内，越权由
主程序后端校验。
"""

import asyncio
import logging
import os
from typing import Any, List, Optional, Type

from langchain_core.tools import BaseTool
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger("ai")

DOO_BIN = "/usr/local/bin/doo"
EXEC_TIMEOUT = 35  # 秒，略大于 doo 内部 30s HTTP / page 轮询超时
STDOUT_LIMIT = 64 * 1024
STDERR_LIMIT = 4 * 1024

# 允许的顶层子命令（与 doo root.go 对齐）；auth 组被拦（token 由环境注入，不许动本地配置）
ALLOWED_TOP = {
    "task", "project", "column", "dialog", "message", "group",
    "user", "bot", "file", "report", "search", "page", "app", "system",
    "--help", "-h", "--version",
}

_DESCRIPTION = """通过 DooTask 命令行 `doo` 执行操作（以当前用户身份，权限由后端校验）。
参数 args 是 doo 的 argv 数组，例如 ["task","list","--project","12"]。输出为 JSON。

命令速查（不确定参数时先执行 ["<子命令>","--help"]）：
- 任务  task list [--project ID --status uncompleted|completed --search 词] | view <ID> [--content --files]
        task create --project ID --name 名 [--owner ID --end "YYYY-MM-DD HH:MM:SS"] | subtask <父ID> <名>
        task update <ID> [--name --content --owner ...] | done <ID> | undone <ID>
        task files <ID> | dialog <ID> | notify <ID> --text 内容 [--nickname 名 --silence] | archive/delete <ID>
- 项目  project list | view <ID> | create --name 名 | update <ID> [...] | exit/delete <ID>
- 看板列 column list --project ID | create/update/delete ...
- 对话  dialog list | search <词> | view <ID> | users <ID>
- 消息  message send --dialog ID --text 内容 [--silence] | send-user --user ID --text 内容
        message list --dialog ID | search <词> | view <ID> | withdraw/forward/todo/done ...
- 群组  group create | edit | add-user | remove-user | exit | transfer | disband
- 用户  user info | departments | basic --ids 1,2 | search <词>
- 机器人 bot list | view | create | update | delete
- 文件  file list | search <词> | view <ID> | fetch <ID>
- 报告  report received | my | view <ID> | template | submit | mark
- 搜索  search <关键词> [--types task,project,file,...]
- 页面  page context [--query 词] | action <名> [--params JSON] | element <UID> <动作> [值]
        （页面操作驱动用户当前浏览器；会话失效时只影响 page，数据命令不受影响）
- 插件  app list | catalog | install <ID> [--version] | update <ID> | reinstall <ID>
        | uninstall <ID> [--delete-data] | remove <ID> | logs <ID> | containers <ID> | refresh
        （应用插件管理；install/update/uninstall/remove 需管理员，非管理员会被后端拒绝）
- 系统  system version | settings

危险操作（删除任务/解散群/撤回消息等）需带 --yes；调用前必须先口头向用户确认，得到同意再带 --yes 重发。"""


class DooToolInput(BaseModel):
    """Input schema for the doo tool."""

    args: List[str] = Field(
        description='doo 子命令的 argv 数组，如 ["task","list","--project","12"]。不要传成单个字符串。'
    )


class DooTool(BaseTool):
    """执行 doo CLI 命令。"""

    name: str = "doo"
    description: str = _DESCRIPTION
    args_schema: Type[BaseModel] = DooToolInput
    response_format: str = "content_and_artifact"

    # 请求级注入，排除出 schema，不串请求
    token: str = Field(default="", exclude=True)
    session_fd: int = Field(default=0, exclude=True)

    model_config = ConfigDict(arbitrary_types_allowed=True)

    def _run(self, args: List[str]) -> tuple:
        raise NotImplementedError("Use async version")

    def _child_env(self) -> dict:
        env = {
            "DOO_SERVER": "http://nginx",
            "DOO_TOKEN": (self.token or "").removeprefix("Bearer ").strip(),
            "PATH": "/usr/local/bin:/usr/bin:/bin",
            "HOME": "/tmp",
        }
        if self.session_fd and int(self.session_fd) > 0:
            env["DOO_SESSION"] = str(int(self.session_fd))
        return env

    async def _arun(self, args: List[str]) -> tuple:
        if not isinstance(args, list) or not args or not all(isinstance(a, str) for a in args):
            return ([{"type": "text", "text": "参数错误：args 必须是非空字符串数组"}], None)

        top = args[0]
        if top not in ALLOWED_TOP:
            return ([{"type": "text", "text": f"不支持的命令：{top}（doo 不允许执行该子命令）"}], None)

        # 默认请求 JSON 输出，便于解析
        argv = list(args)
        if "--json" not in argv:
            argv.append("--json")

        try:
            proc = await asyncio.create_subprocess_exec(
                DOO_BIN, *argv,
                env=self._child_env(),
                stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except FileNotFoundError:
            logger.error("doo 二进制未找到：%s", DOO_BIN)
            return ([{"type": "text", "text": "doo 命令不可用（二进制缺失）"}], None)

        try:
            out_b, err_b = await asyncio.wait_for(proc.communicate(), timeout=EXEC_TIMEOUT)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            return ([{"type": "text", "text": f"命令超时（>{EXEC_TIMEOUT}s）"}], None)

        code = proc.returncode
        # 审计：记录 argv（不含 token，token 只在 env）+ 退出码 + 是否带会话
        logger.info("doo exec argv=%s fd=%s exit=%s", argv, int(self.session_fd or 0), code)
        stdout = (out_b or b"").decode("utf-8", "replace")
        stderr = (err_b or b"").decode("utf-8", "replace")
        if len(stdout) > STDOUT_LIMIT:
            stdout = stdout[:STDOUT_LIMIT] + "\n…[输出已截断]"
        if len(stderr) > STDERR_LIMIT:
            stderr = stderr[:STDERR_LIMIT] + "\n…[已截断]"

        artifact = {"exit_code": code, "argv": argv}

        if code == 0:
            return ([{"type": "text", "text": stdout or "（无输出）"}], artifact)

        # 页面会话失效/缺失：仅影响 page 命令，引导模型降级到数据命令
        if top == "page" and ("会话不存在" in stderr or "无权限" in stderr or "缺少会话" in stderr):
            return ([{"type": "text", "text":
                "页面操作会话已失效（用户可能刷新过页面）。请改用数据命令完成，"
                "或提示用户重新打开 AI 助手。"}], artifact)

        if code == 3:
            return ([{"type": "text", "text": "会话鉴权失效，请重试"}], artifact)

        return ([{"type": "text", "text": (stderr or stdout or "命令执行失败").strip()}], artifact)
