from concurrent.futures import ThreadPoolExecutor
import threading
import time
import logging

class DynamicThreadPoolExecutor(ThreadPoolExecutor):
    """
    动态线程池执行器
    根据任务负载动态调整线程池大小
    """
    def __init__(self, min_workers=5, max_workers=20, thread_name_prefix="dynamic_pool_"):
        """
        初始化动态线程池
        :param min_workers: 最小工作线程数
        :param max_workers: 最大工作线程数
        :param thread_name_prefix: 线程名称前缀
        """
        if min_workers > max_workers:
            raise ValueError("min_workers cannot be greater than max_workers")

        # 初始化日志
        self._logger = logging.getLogger("DynamicThreadPool")
        self._logger.setLevel(logging.INFO)
        if not self._logger.handlers:
            handler = logging.StreamHandler()
            handler.setFormatter(logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            ))
            self._logger.addHandler(handler)

        super().__init__(max_workers=min_workers, thread_name_prefix=thread_name_prefix)
        self.min_workers = min_workers
        self.max_workers = max_workers
        
        # 线程池状态
        self._current_workers = min_workers
        self._active_tasks = 0
        self._active_tasks_lock = threading.Lock()
        
        # 记录上一次的状态
        self._last_workers = min_workers
        self._last_tasks = 0

    def submit(self, fn, *args, **kwargs):
        """
        提交任务到线程池
        """
        with self._active_tasks_lock:
            self._active_tasks += 1
            if self._active_tasks != self._last_tasks:
                self._logger.info(f"Tasks changed: {self._last_tasks} -> {self._active_tasks}")
                self._last_tasks = self._active_tasks
            
            # 如果活跃任务数接近当前线程数，考虑扩容
            if (self._active_tasks >= self._current_workers and 
                self._current_workers < self.max_workers):
                new_workers = min(self.max_workers, self._current_workers + 1)
                self._adjust_pool_size(new_workers)
            
        future = super().submit(fn, *args, **kwargs)
        future.add_done_callback(self._task_done_callback)
        return future

    def _task_done_callback(self, future):
        """
        任务完成回调
        """
        with self._active_tasks_lock:
            self._active_tasks = max(0, self._active_tasks - 1)
            if self._active_tasks != self._last_tasks:
                self._logger.info(f"Tasks changed: {self._last_tasks} -> {self._active_tasks}")
                self._last_tasks = self._active_tasks
            
            # 如果活跃任务数明显少于当前线程数，考虑缩容
            if (self._active_tasks < self._current_workers * 0.5 and 
                self._current_workers > self.min_workers):
                new_workers = max(self.min_workers, self._current_workers - 1)
                self._adjust_pool_size(new_workers)
            
        try:
            future.result()
        except Exception as e:
            self._logger.error(f"Task failed with error: {str(e)}")

    def _adjust_pool_size(self, new_size):
        """
        调整线程池大小
        """
        self._max_workers = new_size
        self._current_workers = new_size
        self._logger.info(f"Workers changed: {self._last_workers} -> {self._current_workers}")
        self._last_workers = self._current_workers
