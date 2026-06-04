package schema

type HttpRetMessage[T any] struct {
	Ret  int    `json:"ret"`
	Msg  string `json:"msg"`
	Data T      `json:"data"`
}

func Success[T any]() *HttpRetMessage[T] {
	return &HttpRetMessage[T]{
		Ret: 1,
		Msg: "success",
	}
}

func SuccessWithData[T any](data T) *HttpRetMessage[T] {
	return &HttpRetMessage[T]{
		Ret:  1,
		Msg:  "success",
		Data: data,
	}
}

func Error[T any](msg string) *HttpRetMessage[T] {
	return &HttpRetMessage[T]{
		Ret: 0,
		Msg: msg,
	}
}

func ErrorWithData[T any](msg string, data T) *HttpRetMessage[T] {
	return &HttpRetMessage[T]{
		Ret:  0,
		Msg:  msg,
		Data: data,
	}
}
