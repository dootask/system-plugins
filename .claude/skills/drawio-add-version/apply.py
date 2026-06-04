#!/usr/bin/env python3
"""把 DooTask drawio 定制套用到某版本目录的 webapp 文件上（幂等 + 多版本候选 + 未命中告警）。

用法: apply.py <版本目录>      # 例: apply.py drawio/30.0.4
读取本技能 patches.json，对 webapp 下对应文件做字面替换。

补丁模型见 build_patches.py。每条 change 判定顺序（顺序很重要）：
  1) done 命中 → 已套用，跳过（注入型 old 会残留，靠 done 防重复）；
  2) 否则任一 variant 的 old 命中 → 套用首个（all 则全替换）；
  3) 否则任一 variant 的 new 命中 → 已套用，跳过；
  4) 都没有 → ⚠️ 未命中（新版结构变了，需人工核对）。
"""
import sys, os, json

HERE = os.path.dirname(os.path.abspath(__file__))

def main():
    if len(sys.argv) != 2:
        print("用法: apply.py <版本目录>"); sys.exit(2)
    webapp = os.path.join(sys.argv[1], "webapp")
    changes = json.load(open(os.path.join(HERE, "patches.json"), encoding="utf-8"))

    # 按文件分组读入
    files = {}
    for c in changes:
        files.setdefault(c["file"], None)
    for rel in files:
        p = os.path.join(webapp, rel)
        if not os.path.exists(p):
            print(f"  ❌ 找不到 {p}"); sys.exit(1)
        files[rel] = open(p, encoding="utf-8").read()

    applied = skipped = missed = 0
    for c in changes:
        rel = c["file"]; content = files[rel]
        name = c["name"]; vs = c["variants"]
        done = c.get("done"); allf = c.get("all", False)

        # 1) done 命中 → 已套用
        if done is not None and done in content:
            skipped += 1; continue
        # 2) 任一 old 命中 → 套用（优先于 new 判定，避免跨版本 new 误判）
        hit = next((v for v in vs if v["old"] in content), None)
        if hit is None:
            # 3) 任一 new 命中 → 已套用
            if any(v["new"] in content for v in vs):
                skipped += 1; continue
            # 4) 未命中
            print(f"  ⚠️  [{rel.split('/')[-1]}] {name}: 未命中（新版结构可能变了），需人工核对")
            missed += 1; continue
        cnt = content.count(hit["old"])
        content = content.replace(hit["old"], hit["new"]) if allf else content.replace(hit["old"], hit["new"], 1)
        files[rel] = content
        applied += 1
        extra = f"，替换 {cnt} 处" if allf else ""
        print(f"  ✅ [{rel.split('/')[-1]}] {name}{extra}")

    for rel, content in files.items():
        open(os.path.join(webapp, rel), "w", encoding="utf-8").write(content)

    print(f"\n套用 {applied} / 跳过(已有) {skipped} / 未命中 {missed}（共 {len(changes)}）")
    if missed:
        print("⚠️  有未命中：对照 patches.json 的 old/new 在新版文件里找等价位置，"
              "用 build_patches.py 补一个该版本的 variant，再重跑。务必浏览器实跑验证。")
    else:
        print("✅ 全部套用/已存在，无未命中。")

if __name__ == "__main__":
    main()
