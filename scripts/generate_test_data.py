import os
import sqlite3
import random
from datetime import datetime, timedelta
from faker import Faker

fake = Faker('fa_IR')

# ۱. تعریف صریح و قطعی مسیر فولدر data و فایل دیتابیس
DATA_DIR = r"D:\project\Dideban\data"
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "dideban_dev.db")

def init_db(cursor):
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ntsw_orders (
        order_reg_number TEXT PRIMARY KEY,
        importer_national_id TEXT NOT NULL,
        importer_name TEXT NOT NULL,
        hs_code TEXT NOT NULL,
        goods_description TEXT NOT NULL,
        total_usd REAL NOT NULL,
        created_at TEXT NOT NULL
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS cbi_allocations (
        allocation_tracking_code TEXT PRIMARY KEY,
        order_reg_number TEXT NOT NULL,
        importer_national_id TEXT NOT NULL,
        currency_type TEXT NOT NULL,
        allocated_usd REAL NOT NULL,
        allocation_date TEXT NOT NULL,
        FOREIGN KEY (order_reg_number) REFERENCES ntsw_orders (order_reg_number)
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS epl_declarations (
        cottage_number TEXT PRIMARY KEY,
        order_reg_number TEXT NOT NULL,
        importer_national_id TEXT NOT NULL,
        declared_hs_code TEXT NOT NULL,
        declared_goods_description TEXT NOT NULL,
        declared_value_usd REAL NOT NULL,
        customs_clearance_date TEXT NOT NULL,
        gross_weight_kg REAL NOT NULL
    );
    """)

def seed_data():
    print(f"--- در حال اتصال به: {DB_PATH} ---")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    init_db(cursor)

    cursor.execute("DELETE FROM epl_declarations")
    cursor.execute("DELETE FROM cbi_allocations")
    cursor.execute("DELETE FROM ntsw_orders")

    base_date = datetime(2026, 1, 1)

    # سناریو ۱: نرمال
    normal_goods = [
        ("84713000", "لپ‌تاپ گیمینگ و مهندسی مدل Core i7"),
        ("85171300", "گوشی تلفن همراه هوشمند ۲۵۶ گیگابایت"),
        ("84182100", "یخچال فریزر ساید بای ساید خانگی ۲۸ فوت"),
        ("96081000", "خودکار و روان‌نویس اداری نوک ساچمه‌ای"),
        ("87082900", "لنت ترمز سرامیکی خودرو سواری")
    ]

    for i in range(1, 31):
        order_no = f"NTSW-{2026000 + i}"
        national_id = f"1010{random.randint(1000000, 9999999)}"
        company_name = f"بازرگانی {fake.last_name()}"
        hs_code, desc = random.choice(normal_goods)
        usd_val = round(random.uniform(5000, 45000), 2)
        order_date = base_date + timedelta(days=random.randint(1, 40))

        cursor.execute("INSERT INTO ntsw_orders VALUES (?, ?, ?, ?, ?, ?, ?)",
                       (order_no, national_id, company_name, hs_code, desc, usd_val, order_date.strftime("%Y-%m-%d")))

        cursor.execute("INSERT INTO cbi_allocations VALUES (?, ?, ?, ?, ?, ?)",
                       (f"CBI-{random.randint(100000, 999999)}", order_no, national_id, "NIMA", usd_val, (order_date + timedelta(days=5)).strftime("%Y-%m-%d")))

        cursor.execute("INSERT INTO epl_declarations VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                       (f"EPL-{990000 + i}", order_no, national_id, hs_code, f"ترخیص {desc}", usd_val, (order_date + timedelta(days=20)).strftime("%Y-%m-%d"), round(usd_val * 0.12, 1)))

    # سناریو ۲: تخلف تعویض کالا (روان‌نویس -> مداد)
    order_fraud_1 = "NTSW-FRAUD-001"
    fraud_company_1 = "10109988771"
    cursor.execute("INSERT INTO ntsw_orders VALUES (?, ?, ?, ?, ?, ?, ?)",
                   (order_fraud_1, fraud_company_1, "توسعه تجارت نگین البرز", "96081000", "روان‌نویس فوق روان اداری و مهندسی", 150000.0, "2026-02-10"))

    cursor.execute("INSERT INTO cbi_allocations VALUES (?, ?, ?, ?, ?, ?)",
                   ("CBI-774411", order_fraud_1, fraud_company_1, "PREFERENTIAL_28500", 150000.0, "2026-02-15"))

    cursor.execute("INSERT INTO epl_declarations VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                   ("EPL-881100", order_fraud_1, fraud_company_1, "96091000", "مداد گرافیتی مشکی و رنگی بسته‌ای", 145000.0, "2026-03-01", 12000.0))

    # سناریو ۳: قطعات منفصل یخچال
    fraud_company_2 = "10105544332"
    refrigerator_parts = [
        ("NTSW-SPLIT-101", "84143000", "کمپرسور برودتی پیستونی یخچال خانگی", 40000.0, "2026-02-01"),
        ("NTSW-SPLIT-102", "84189910", "بدنه عایق‌بندی‌شده و کابین درب یخچال", 60000.0, "2026-02-05"),
        ("NTSW-SPLIT-103", "84189990", "کندانسور، اواپراتور و مدار سیم‌کشی یخچال", 30000.0, "2026-02-12")
    ]

    for part_order_no, hs, desc, val, dt in refrigerator_parts:
        cursor.execute("INSERT INTO ntsw_orders VALUES (?, ?, ?, ?, ?, ?, ?)",
                       (part_order_no, fraud_company_2, "تولیدی پارس سرمایش سپهر", hs, desc, val, dt))
        cursor.execute("INSERT INTO cbi_allocations VALUES (?, ?, ?, ?, ?, ?)",
                       (f"CBI-{random.randint(200000, 299999)}", part_order_no, fraud_company_2, "NIMA", val, dt))
        cursor.execute("INSERT INTO epl_declarations VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                       (f"EPL-SPLIT-{random.randint(100, 999)}", part_order_no, fraud_company_2, hs, desc, val, dt, val * 0.2))

    conn.commit()
    conn.close()
    print(f"موفقیت: پایگاه داده با ۳۳ پرونده دقیقا در این مسیر ساخته شد:\n{DB_PATH}")

if __name__ == "__main__":
    seed_data()