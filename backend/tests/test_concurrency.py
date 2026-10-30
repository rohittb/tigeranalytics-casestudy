from sqlalchemy import select
from app.models.pricing import StorePricing


def test_stale_version_returns_409_conflict(client, db_session):
    pricing = db_session.scalar(select(StorePricing))
    pricing_id = pricing.id

    # First update: version 1 -> 2
    res1 = client.patch(f"/api/v1/pricing/{pricing_id}", json={"price": 260.00, "expected_version": 1})
    assert res1.status_code == 200
    assert res1.json()["version"] == 2

    # Second user tries to update using stale version 1
    res2 = client.patch(f"/api/v1/pricing/{pricing_id}", json={"price": 270.00, "expected_version": 1})
    assert res2.status_code == 409
    err = res2.json()["error"]
    assert err["code"] == "CONCURRENCY_CONFLICT"
    assert "details" in err
    assert err["details"]["current_version"] == 2
    assert float(err["details"]["current_price"]) == 260.00

    # Verify that record was NOT overwritten with stale price 270.00
    db_session.refresh(pricing)
    assert pricing.version == 2
    assert float(pricing.price) == 260.00


def test_negative_price_rejected(client, db_session):
    pricing = db_session.scalar(select(StorePricing))
    res = client.patch(f"/api/v1/pricing/{pricing.id}", json={"price": -10.00, "expected_version": 1})
    assert res.status_code == 422


def test_excess_fractional_precision_rejected(client, db_session):
    pricing = db_session.scalar(select(StorePricing))
    # 3 decimal places (e.g. 249.999) must be rejected
    res = client.patch(f"/api/v1/pricing/{pricing.id}", json={"price": 249.999, "expected_version": 1})
    assert res.status_code == 422
