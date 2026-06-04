# minder

## Project setup
```bash
yarn install
```

### Compiles and hot-reloads for development
```bash
yarn serve
```

### Compiles and minifies for production
```bash
# build
yarn build

# publish to docker
docker buildx build --platform linux/amd64,linux/arm64 -t kuaifan/minder:latest . --push
```
