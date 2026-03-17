# Build stage
FROM golang:1.22-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

ARG VERSION=dev
RUN CGO_ENABLED=0 go build -ldflags "-X main.version=${VERSION}" -o /app/myapp .

# Final stage
FROM alpine:latest

WORKDIR /app
COPY --from=builder /app/myapp .

ENTRYPOINT ["/app/myapp"]
