#!/usr/bin/env python3
"""作者侧工具：从真实文件精确切片，生成 patches.json（紧锚点 + 多版本候选 + done 幂等标记）。

输入（写死路径，仅作者本机用）：
  C24 = drawio/24.7.17/webapp           (已定制的 24.7.17，作为字节级基准)
  O24 = /tmp/dx-orig                      (24.7.17 镜像原始)
  O30 = /tmp/dx-orig30                    (30.0.4 镜像原始)

输出： patches.json （运行期由 apply.py 消费）

补丁模型（每条 change）：
  { "file": <webapp内相对路径>, "name": <说明>, "all": <bool 可选>,
    "done": <已套用判定串 可选>, "variants": [ {"old","new"}, ... ] }
apply 时：done 命中→跳过；否则任一 variant 的 new 在且 old 不在→跳过；
否则首个 old 命中→替换（all 则全替换）；都没有→告警未命中。
"""
import os, re, json

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
C24 = os.path.join(ROOT, "drawio/24.7.17/webapp")
O24 = "/tmp/dx-orig"
O30 = "/tmp/dx-orig30"

def rd(base, rel):
    # O24/O30 是扁平提取（文件名在根目录），C24 是真实 webapp 路径
    if base in (O24, O30):
        rel = os.path.basename(rel)
    with open(os.path.join(base, rel), encoding="utf-8") as f:
        return f.read()

IDX = "index.html"
ELE = "js/diagramly/ElectronApp.js"
APP = "js/app.min.js"

changes = []

def add(file, name, variants, all=False, done=None):
    c = {"file": file, "name": name, "variants": variants}
    if all:  c["all"] = True
    if done: c["done"] = done
    changes.append(c)

# ---------- index.html ----------
# 注入 EXPORT_URL/LIGHTBOX/ICONSEARCH。24 注在 geBootstrap 内联脚本里；30 起 geBootstrap 移入
# 外部 js/bootstrap.js，改为在 bootstrap.js 之前插一段内联 <script>。
c24_idx = rd(C24, IDX).splitlines(keepends=True)
# 24 定制版：第 19 行 geBootstrap，20-22 三行注入，23 空行
ge_line = c24_idx[18]                       # \t<script id="geBootstrap" ...>\n
inj3 = "".join(c24_idx[19:22])              # 三行 \t\twindow.* 注入
blank = c24_idx[22]                         # 空行
varA_old = ge_line
varA_new = ge_line + inj3 + blank
# 30：bootstrap.js 行前插内联脚本（复用同样的三行注入内容）
o30_idx = rd(O30, IDX)
m = re.search(r'\t<script src="js/bootstrap\.js"></script>\n', o30_idx)
boot_line = m.group(0)
varB_old = boot_line
varB_new = '\t<script type="text/javascript">\n' + inj3 + '\t</script>\n' + boot_line
add(IDX, "inject EXPORT_URL/LIGHTBOX/ICONSEARCH",
    [{"old": varA_old, "new": varA_new}, {"old": varB_old, "new": varB_new}],
    done='window.EXPORT_URL = window.location.origin + "/drawio/export/";')

# .geBlock 加 display:none（隐藏空画布提示块）。源码稳定，跨版本一致。
def geblock(orig):
    s = rd(orig, IDX)
    m = re.search(r'\.geBlock \{\n(\t+)', s)
    indent = m.group(1)
    old = ".geBlock {\n" + indent
    new = ".geBlock {\n" + indent + "display: none;\n" + indent
    return old, new
gb_old, gb_new = geblock(O30)
gb_old24, gb_new24 = geblock(O24)
gb_variants = [{"old": gb_old, "new": gb_new}]
if gb_old24 != gb_old:
    gb_variants.append({"old": gb_old24, "new": gb_new24})
# done：注入型（old 残留于 new 头部），用「.geBlock { + display:none」唯一判定
gb_done = gb_new[: gb_new.index("display: none;") + len("display: none;")]
add(IDX, ".geBlock display:none", gb_variants, done=gb_done)

# 隐藏 30.x 起底部标签栏右下角的 jgraph/drawio GitHub 角标（Pages.js 无条件创建、无 urlParam）。
# 在 <style> 开头注入一条 CSS（属性选择器精确命中该链接，不误伤 /discussions 帮助链接）。
# 24.7.x 无此角标，规则无害（命不中任何元素）。
gh_rule = '\t\ta[href="https://github.com/jgraph/drawio"]{display:none !important}\n'
def style_open(orig):
    s = rd(orig, IDX)
    m = re.search(r'\t<style type="text/css">\n', s)
    return m.group(0)
so30 = style_open(O30); so24 = style_open(O24)
gh_variants = [{"old": so30, "new": so30 + gh_rule}]
if so24 != so30:
    gh_variants.append({"old": so24, "new": so24 + gh_rule})
add(IDX, "hide jgraph/drawio github corner icon", gh_variants, done=gh_rule.strip("\t\n"))

# ---------- ElectronApp.js ----------
# 1) 注释掉「移除已有 CSP + 注入严格 CSP」整块。块内 mxmeta 行随版本变，故按版本存候选。
def csp_block(text):
    # 从 'var allMeta' 到 'Content-Security-Policy');' 的整段（含起始缩进）
    m = re.search(r"\t\tvar allMeta = document\.getElementsByTagName\('meta'\);.*?'Content-Security-Policy'\);\n",
                  text, re.S)
    return m.group(0)
def comment_block(block):
    out = []
    for ln in block.splitlines(keepends=True):
        nl = "\n" if ln.endswith("\n") else ""
        body = ln[:-1] if nl else ln
        stripped = body.lstrip("\t")
        ind = body[:len(body) - len(stripped)]
        out.append((ind + "// " + stripped if stripped else ind + "//") + nl)
    return "".join(out)
# 24：用 C24 里实际已注释的版本做 new（保证字节级复现）
o24_ele = rd(O24, ELE); c24_ele = rd(C24, ELE)
blk24 = csp_block(o24_ele)
# C24 中该块已被注释——按相同起止 token 在 C24 中取已注释块
mC = re.search(r"\t\t// var allMeta = document\.getElementsByTagName\('meta'\);.*?'Content-Security-Policy'\);\n",
               c24_ele, re.S)
blk24_commented = mC.group(0)
o30_ele = rd(O30, ELE)
blk30 = csp_block(o30_ele)
blk30_commented = comment_block(blk30)
add(ELE, "comment out CSP override block",
    [{"old": blk24, "new": blk24_commented}, {"old": blk30, "new": blk30_commented}],
    done="// var allMeta = document.getElementsByTagName('meta');")

# 2) File 菜单精简（源码稳定，跨版本一致，从 C24/O24 直接取）
menu1_old = ("\t\t\tthis.addMenuItems(menu, ['new', 'open'], parent);\n"
             "\t\t\tthis.addSubmenu('openRecent', menu, parent);\n"
             "\t\t\tthis.addMenuItems(menu, ['-', 'synchronize', '-', 'save', 'saveAs', '-', 'import'], parent);\n")
menu1_new = "\t\t\tthis.addMenuItems(menu, ['import'], parent);\n"
add(ELE, "trim File menu (new/open/save...) -> import only",
    [{"old": menu1_old, "new": menu1_new}], done="this.addMenuItems(menu, ['import'], parent);")

menu2_old = "\t\t\tthis.addMenuItems(menu, ['-', 'pageSetup', 'print', '-', 'close', '-', 'exit'], parent);\n"
menu2_new = "\t\t\tthis.addMenuItems(menu, ['-', 'pageSetup', 'print'], parent);\n"
add(ELE, "trim File menu tail (remove close/exit)",
    [{"old": menu2_old, "new": menu2_new}], done="this.addMenuItems(menu, ['-', 'pageSetup', 'print'], parent);")

# ---------- app.min.js ----------
o24_app = rd(O24, APP); o30_app = rd(O30, APP)

# #1 addBeforeUnloadListener -> 空函数（两版字节一致）
bu_old = ("addBeforeUnloadListener=function(){window.onbeforeunload=mxUtils.bind(this,"
          "function(){if(!this.editor.isChromelessView())return this.onBeforeUnload()})}")
bu_new = "addBeforeUnloadListener=function(){}"
assert bu_old in o24_app and bu_old in o30_app
# 不设 done：vanilla 里已存在一个基类默认的空 function(){}，做 done 会误命中导致漏套；
# old 是完整非空函数体（唯一），靠它命中即可，幂等由「old 消失」保证。
add(APP, "disable addBeforeUnloadListener", [{"old": bu_old, "new": bu_new}])

# #2 默认菜单去掉 help（两版一致）
help_old = 'defaultMenuItems="file edit view arrange extras help".split(" ")'
help_new = 'defaultMenuItems="file edit view arrange extras".split(" ")'
assert help_old in o24_app and help_old in o30_app
add(APP, "remove help from defaultMenuItems", [{"old": help_old, "new": help_new}], done=help_new)

# #4 EmbedFile 标题支持 urlParams.title（两版一致）
emb_old = 'EmbedFile.prototype.getTitle=function(){return this.desc.title||""}'
emb_new = ('EmbedFile.prototype.getTitle=function(){return this.desc.title||'
           '(urlParams.title?decodeURIComponent(urlParams.title):"")}')
assert emb_old in o24_app and emb_old in o30_app
add(APP, "EmbedFile.getTitle support urlParams.title", [{"old": emb_old, "new": emb_new}],
    done=emb_new)

# #3 ICONSEARCH：去掉 bind 回调里紧跟的 !this.editorUi.isOffline()&&（变量名随版本变）
def icon_variant(text):
    m = re.search(r"null!=ICONSEARCH_PATH&&[a-z]&&\([a-z]=mxUtils\.bind\(this,function\(([a-z,]+)\)\{"
                  r"(!this\.editorUi\.isOffline\(\)&&)", text)
    if not m: return None
    args = m.group(1)
    old = "function(%s){!this.editorUi.isOffline()&&" % args
    new = "function(%s){" % args
    return {"old": old, "new": new}
icon_vs = []
for t in (o30_app, o24_app):
    v = icon_variant(t)
    if v and v not in icon_vs: icon_vs.append(v)
add(APP, "iconsearch: drop isOffline guard", icon_vs)

# #5 insertTemplate：去掉 insertTemplateEnabled&&!<v>.isOffline()&&（变量名随版本变，可能多处）
def tpl_variants(text):
    res = []
    for m in re.finditer(r"insertTemplateEnabled&&!([a-z])\.isOffline\(\)&&", text):
        v = "insertTemplateEnabled&&!%s.isOffline()&&" % m.group(1)
        pair = {"old": v, "new": "insertTemplateEnabled&&"}
        if pair not in res: res.append(pair)
    return res
tpl_vs = []
for t in (o30_app, o24_app):
    for p in tpl_variants(t):
        if p not in tpl_vs: tpl_vs.append(p)
add(APP, "insertTemplate: drop isOffline guard", tpl_vs, all=True)

# ---------- 写出 ----------
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "patches.json")
json.dump(changes, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"写出 {len(changes)} 条 change -> {out}")
for c in changes:
    print(f"  [{c['file'].split('/')[-1]}] {c['name']}  ({len(c['variants'])} variant)")
