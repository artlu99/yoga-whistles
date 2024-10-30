CREATE TABLE stored_data (
    obscured_message_id,
    salted_hashed_fid,
    shifted_timestamp,
    encrypted_message,
    obscured_hashed_text,
    deleted_at,
    partition_id,
    schema_version,
    PRIMARY KEY (
        partition_id,
        schema_version,
        obscured_message_id
    )
);