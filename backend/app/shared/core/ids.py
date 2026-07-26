import uuid


def generate_uuid7() -> uuid.UUID:
    """Time-ordered UUID for syncable entity ids.

    Client-generated in the frontend for offline creates; used here for any
    server-side id generation (seed data, server-originated records) so ids
    stay consistent across the whole system.
    """
    return uuid.uuid7()
