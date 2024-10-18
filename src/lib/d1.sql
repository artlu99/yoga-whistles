CREATE TABLE stored_data (
    obscured_message_id,
    salted_hashed_fid,
    shifted_timestamp,
    encrypted_message,
    obscured_hashed_text,
    schema_version,
    PRIMARY KEY (
        schema_version,
        obscured_message_id
    )
);