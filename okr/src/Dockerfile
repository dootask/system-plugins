### Build frontend (Vite -> web/dist for Go embed)
FROM node:22 AS web

WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

### Build backend (Go embeds web/dist)
FROM golang:1.20.2-alpine AS server

RUN apk add --no-cache build-base sqlite-dev

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . ./
COPY --from=web /src/web/dist ./web/dist
RUN env CGO_ENABLED=1 GOOS=linux GOARCH=amd64 \
  go build -trimpath -ldflags "-s -w" -o /out/main main.go

### Runtime
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata sqlite-libs \
  && adduser -D -H -u 10001 app \
  && mkdir -p /var/doo/.cache \
  && chown -R app:app /var/doo

WORKDIR /var/doo
COPY --from=server /out/main ./main

EXPOSE 5566
USER app
ENTRYPOINT ["./main"]
