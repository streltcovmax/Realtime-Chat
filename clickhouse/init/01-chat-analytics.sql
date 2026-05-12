CREATE DATABASE IF NOT EXISTS chat_analytics;

CREATE TABLE IF NOT EXISTS chat_analytics.events
(
    event_time DateTime64(3, 'UTC'),
    event_type LowCardinality(String),
    user_id String,
    peer_id String,
    chat_id Nullable(UInt64),
    message_id Nullable(UInt64),
    query String,
    result_count Nullable(UInt32),
    message_length Nullable(UInt32),
    query_length Nullable(UInt32),
    status LowCardinality(String),
    metadata String
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(event_time)
ORDER BY (event_type, event_time, user_id);
