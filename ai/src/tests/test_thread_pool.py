import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from helper.thread_pool import DynamicThreadPoolExecutor
import time
import threading
from concurrent.futures import wait
import datetime

def get_thread_count():
    """获取当前活跃的线程数"""
    return threading.active_count()

def test_max_threads():
    """测试线程池扩展性能"""
    
    # 创建线程池
    pool = DynamicThreadPoolExecutor(
        min_workers=5,          # 最小5个线程
        max_workers=50,         # 最大50个线程
        thread_name_prefix="ai_stream_"
    )

    def task(task_id, sleep_time):
        """模拟一个耗时任务"""
        thread_name = threading.current_thread().name
        time.sleep(sleep_time)  # 模拟IO等待
        return task_id

    print("\n=== 测试线程池扩展性能 ===")
    print(f"开始时间: {datetime.datetime.now()}")
    
    # 记录初始线程数
    print("\n初始状态:")
    initial_threads = get_thread_count()
    print(f"活跃线程数: {initial_threads}")

    # 提交任务并监控线程数变化
    futures = []
    for i in range(100):  # 提交100个任务
        sleep_time = 5  # 每个任务运行5秒
        future = pool.submit(task, i, sleep_time)
        futures.append(future)
        
        # 每提交10个任务记录一次线程数
        if (i + 1) % 10 == 0:
            time.sleep(0.5)  # 给线程池一些时间来创建新线程
            current_threads = get_thread_count()
            print(f"\n提交{i + 1}个任务后:")
            print(f"活跃线程数: {current_threads}")
    
    # 等待3秒，让线程池有时间创建所有线程
    print("\n等待3秒观察最大线程数...")
    time.sleep(3)
    
    # 记录峰值线程数
    peak_threads = get_thread_count()
    print("\n峰值状态:")
    print(f"活跃线程数: {peak_threads}")
    
    # 取消所有未完成的任务
    print("\n开始取消任务...")
    for future in futures:
        future.cancel()
    
    # 等待线程池缩减
    print("\n等待3秒观察线程池缩减情况...")
    time.sleep(3)
    
    # 记录最终线程数
    final_threads = get_thread_count()
    print("\n最终状态:")
    print(f"活跃线程数: {final_threads}")
    
    print(f"\n结束时间: {datetime.datetime.now()}")
    print("\n测试完成")

if __name__ == "__main__":
    test_max_threads()
