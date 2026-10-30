from sqlalchemy import select
from app.models.store import Store
from app.models.pricing import StorePricing
from app.models.audit import AuditEvent, AuditAction


def test_list_stores_with_pricing_counts(client):
    res = client.get("/api/v1/stores?include_inactive=true")
    assert res.status_code == 200
    stores = res.json()
    assert len(stores) >= 1
    # First store (NYC) has 1 pricing record seeded in fixture
    nyc_store = next(s for s in stores if s["store_code"] == "STR-US-001")
    assert nyc_store["pricing_count"] >= 1
    assert nyc_store["active"] is True


def test_create_new_store(client, db_session):
    payload = {
        "store_code": "STR-US-005",
        "name": "Boston Back Bay",
        "country_code": "US",
        "active": True,
    }
    res = client.post("/api/v1/stores", json=payload, headers={"x-actor-id": "system-admin"})
    assert res.status_code == 201
    data = res.json()
    assert data["store_code"] == "STR-US-005"
    assert data["name"] == "Boston Back Bay"
    assert data["active"] is True

    # Duplicate store_code returns 409
    res_dup = client.post("/api/v1/stores", json=payload)
    assert res_dup.status_code == 409


def test_deactivate_store_cascades_to_all_product_pricing(client, db_session):
    # NYC store has pricing record active = True
    store = db_session.scalar(select(Store).where(Store.store_code == "STR-US-001"))
    pricing_res_before = client.get(f"/api/v1/pricing?store_code={store.store_code}").json()
    assert len(pricing_res_before["items"]) > 0
    assert all(item["active"] is True for item in pricing_res_before["items"])

    # System Admin deactivates the store
    patch_res = client.patch(
        f"/api/v1/stores/{store.id}",
        json={"active": False},
        headers={"x-actor-id": "system-admin"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["active"] is False

    # Verify store is now inactive
    db_session.refresh(store)
    assert store.active is False

    # Verify via API query and model property that all product pricing for this store are now effectively deactivated (O(1))
    pricing_res_after = client.get(f"/api/v1/pricing?store_code={store.store_code}").json()
    assert len(pricing_res_after["items"]) > 0
    assert all(item["active"] is False for item in pricing_res_after["items"])

    pricing_after = db_session.scalars(select(StorePricing).where(StorePricing.store_id == store.id)).all()
    assert len(pricing_after) > 0
    assert all(p.is_active is False for p in pricing_after)

    # Verify audit event recorded
    audit = db_session.scalar(
        select(AuditEvent).where(
            AuditEvent.action == AuditAction.STORE_DEACTIVATE,
            AuditEvent.entity_key == f"store:{store.store_code}",
        )
    )
    assert audit is not None
    assert audit.actor_id == "system-admin"

    # Reactivate the store
    reactivate_res = client.patch(
        f"/api/v1/stores/{store.id}",
        json={"active": True},
        headers={"x-actor-id": "system-admin"},
    )
    assert reactivate_res.status_code == 200
    assert reactivate_res.json()["active"] is True

    # Product pricing reactivated automatically in O(1)
    pricing_res_reactivated = client.get(f"/api/v1/pricing?store_code={store.store_code}").json()
    assert all(item["active"] is True for item in pricing_res_reactivated["items"])
    db_session.expire_all()
    pricing_reactivated = db_session.scalars(select(StorePricing).where(StorePricing.store_id == store.id)).all()
    assert all(p.is_active is True for p in pricing_reactivated)
