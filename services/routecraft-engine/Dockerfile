FROM rust:1.98-bookworm AS build
WORKDIR /workspace
COPY Cargo.toml Cargo.lock ./
COPY src src
RUN cargo build --locked --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
RUN useradd --system --uid 10001 engine
USER engine
COPY --from=build /workspace/target/release/routecraft-engine /usr/local/bin/routecraft-engine
ENTRYPOINT ["routecraft-engine"]
