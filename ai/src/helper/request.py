import httpx

class RequestClient:
    """
    请求类，用于处理与服务器的通信
    """
    def __init__(self, server_url, version, token, dialog_id, action='sendtext'):
        """
        初始化请求类
        :param server_url: 服务器地址
        :param version: API版本
        :param token: 认证令牌
        :param dialog_id: 对话ID
        :param action: 请求动作类型（'stream' 或 'sendtext'），默认为 'sendtext'
        """
        self.server_url = server_url
        self.version = version
        self.token = token
        self.dialog_id = dialog_id
        self.action = action
        
        # 初始化请求头
        self.headers = {
            'version': version,
            'token': token
        }

    def _get_url(self, server_url, action):
        """
        根据 action 获取请求 URL
        """
        if action == "stream":
            return f"{server_url}/api/dialog/msg/stream"
        elif action == "notice":
            return f"{server_url}/api/dialog/msg/sendnotice"
        elif action == "template":
            return f"{server_url}/api/dialog/msg/sendtemplate"
        else:
            return f"{server_url}/api/dialog/msg/sendtext"

    async def call(self, data, **kwargs):
        """
        发送请求到服务器
        :param data: 请求数据
        :param kwargs: 可选参数，可覆盖初始化时的参数
            - server_url: 覆盖服务器地址
            - version: 覆盖API版本
            - token: 覆盖认证令牌
            - action: 覆盖请求动作
            - timeout: 请求超时时间
        :return: 响应数据中的 id
        """
        # 检查服务器地址
        server_url = kwargs.get('server_url', self.server_url)
        if not server_url or not server_url.startswith(('http://', 'https://')):
            return None

        # 更新headers
        headers = self.headers.copy()
        if 'version' in kwargs:
            headers['version'] = kwargs['version']
        if 'token' in kwargs:
            headers['token'] = kwargs['token']

        # 获取当前action（优先使用kwargs中的值）
        action = kwargs.get('action', self.action)
        call_url = self._get_url(server_url, action)

        # 如果data中没有dialog_id，使用初始化时的dialog_id
        request_data = data.copy()
        if 'dialog_id' not in request_data:
            request_data['dialog_id'] = self.dialog_id

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    call_url,
                    headers=headers,
                    json=request_data,
                    timeout=kwargs.get('timeout', 15)
                )
                return response.json().get('data', {}).get('id')
        except Exception as e:
            return None
