from decimal import Decimal
from sqlalchemy import select
from app.models.pricing import StorePricing
from app.models.audit import AuditEvent, AuditAction, AuditSource


def test_list_pricing_search_and_pagination(client):
    response = client.get("/api/v1/pricing?page=1&limit=10")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert data["total"] >= 1
    assert data["page"] == 1
    assert data["items"][0]["store_code"] == "STR-US-001"
    assert data["items"][0]["product_sku"] == "SKU-ELEC-1001"
    assert float(data["items"][0]["price"]) == 249.99
    assert data["items"][0]["version"] == 1


def test_search_by_filter_store_and_sku(client):
    # Match
    res = client.get("/api/v1/pricing?store_code=STR-US-001&sku=SKU-ELEC-1001")
    assert res.status_code == 200
    assert res.json()["total"] == 1

    # Non-match
    res = client.get("/api/v1/pricing?store_code=NON_EXISTENT")
    assert res.status_code == 200
    assert res.json()["total"] == 0


def test_get_pricing_by_id(client, db_session):
    pricing = db_session.scalar(select(StorePricing))
    response = client.get(f"/api/v1/pricing/{pricing.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == pricing.id
    assert data["version"] == 1
    assert float(data["price"]) == 249.99


def test_get_pricing_not_found(client):
    response = client.get("/api/v1/pricing/999999")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_successful_pricing_update_and_audit(client, db_session):
    pricing = db_session.scalar(select(StorePricing))
    pricing_id = pricing.id

    # Update with expected_version = 1
    update_payload = {
        "price": 279.50,
        "expected_version": 1,
    }
    response = client.patch(f"/api/v1/pricing/{pricing_id}", json=update_payload)
    assert response.status_code == 200
    updated_data = response.json()
    assert float(updated_data["price"]) == 279.50
    assert updated_data["version"] == 2

    # Verify audit event in DB
    audit = db_session.scalar(
        select(AuditEvent).where(
            AuditEvent.action == AuditAction.UPDATE,
            AuditEvent.source == AuditSource.MANUAL,
        )
    )
    assert audit is not None
    assert audit.before_value["version"] == 1
    assert audit.after_value["version"] == 2
    assert audit.after_value["price"] == "279.50"
