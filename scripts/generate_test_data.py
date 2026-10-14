# مسیر فایل: D:\project\Dideban\data\generate_test_data.py
import os
import sqlite3
import random
from datetime import datetime, timedelta
from faker import Faker

fake = Faker('fa_IR')

DATA_DIR = r"D:\project\Dideban\data"
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "dideban_dev.db")

TARGET_RECORD_COUNT = 10000

def init_db(cursor):
    tables_to_drop = [
        "ntsw_orders", "cbi_allocations", "epl_declarations", 
        "bank_transactions", "telecom_cdrs", "BomDefinitions", 
        "DiscrepancyLogs", "TacticalGateways"
    ]
    for table in tables_to_drop:
        cursor.execute(f"DROP TABLE IF EXISTS {table};")

    cursor.execute("""
    CREATE TABLE ntsw_orders (
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
    CREATE TABLE cbi_allocations (
        allocation_tracking_code TEXT PRIMARY KEY,
        order_reg_number TEXT NOT NULL,
        importer_national_id TEXT NOT NULL,
        currency_type TEXT NOT NULL,
        allocated_usd REAL NOT NULL,
        allocation_date TEXT NOT NULL
    );
    """)

    cursor.execute("""
    CREATE TABLE epl_declarations (
        cottage_number TEXT PRIMARY KEY,
        order_reg_number TEXT NOT NULL,
        importer_national_id TEXT NOT NULL,
        declared_hs_code TEXT NOT NULL,
        declared_goods_description TEXT NOT NULL,
        declared_value_usd REAL NOT NULL,
        customs_clearance_date TEXT NOT NULL,
        gross_weight_kg REAL NOT NULL,
        is_audited INTEGER DEFAULT 0
    );
    """)

    cursor.execute("""
    CREATE TABLE bank_transactions (
        transaction_rrn TEXT PRIMARY KEY,
        source_account TEXT NOT NULL,
        dest_account TEXT NOT NULL,
        customer_national_id TEXT NOT NULL,
        amount_irr REAL NOT NULL,
        transaction_date TEXT NOT NULL,
        is_audited INTEGER DEFAULT 0
    );
    """)

    cursor.execute("""
    CREATE TABLE telecom_cdrs (
        call_id TEXT PRIMARY KEY,
        caller_msisdn TEXT NOT NULL,
        receiver_msisdn TEXT NOT NULL,
        caller_national_id TEXT NOT NULL,
        imsi TEXT NOT NULL,
        imei TEXT NOT NULL,
        cell_id TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL,
        call_date TEXT NOT NULL,
        is_audited INTEGER DEFAULT 0
    );
    """)

    # اضافه شدن ستون IsEssential جهت تطابق کامل با مدل C#
    cursor.execute("""
    CREATE TABLE BomDefinitions (
        Id INTEGER PRIMARY KEY AUTOINCREMENT,
        FinishedGoodName TEXT NOT NULL,
        FinishedGoodHsCode TEXT NOT NULL,
        PartName TEXT NOT NULL,
        PartHsCode TEXT NOT NULL,
        PartDuty TEXT NOT NULL,
        IsEssential INTEGER DEFAULT 1
    );
    """)

    cursor.execute("""
    CREATE TABLE DiscrepancyLogs (
        Id INTEGER PRIMARY KEY AUTOINCREMENT,
        OrderRegNumber TEXT NOT NULL,
        CottageNumber TEXT NOT NULL,
        ImporterNationalId TEXT NOT NULL,
        RuleName TEXT NOT NULL,
        Description TEXT NOT NULL,
        RiskScore INTEGER NOT NULL,
        DetectedAt TEXT NOT NULL,
        DomainType TEXT DEFAULT 'CUSTOMS'
    );
    """)

    cursor.execute("""
    CREATE TABLE TacticalGateways (
        Id INTEGER PRIMARY KEY AUTOINCREMENT,
        Domain TEXT NOT NULL,
        Code TEXT NOT NULL UNIQUE,
        Name TEXT NOT NULL,
        Province TEXT NOT NULL,
        Longitude REAL NOT NULL,
        Latitude REAL NOT NULL,
        Category TEXT NOT NULL,
        RiskScore INTEGER NOT NULL
    );
    """)

def seed_large_scale_data():
    print(f"--- در حال اتصال به پایگاه داده در مسیر: {DB_PATH} ---")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    init_db(cursor)
    conn.commit()
    
    print("✨ ساختار جداول با موفقیت بازنشانی شد. شروع تولید و درج دقیق ۱۰,۰۰۰ رکورد...")

    base_date = datetime(2026, 1, 1)

    bom_samples = [
        ("تلویزیون هوشمند LED سایز ۶۵ اینچ", "85287200", "ماژول پردازشی اصلی مادربرد", "85423100", "5%", 1),
        ("تلویزیون هوشمند LED سایز ۶۵ اینچ", "85287200", "پنل نمایشگر Open-Cell", "85299065", "5%", 1),
        ("یخچال فریزر ساید بای ساید ۲۸ فوت", "84182100", "کمپرسور برودتی پیستونی", "84143000", "5%", 1),
        ("یخچال فریزر ساید بای ساید ۲۸ فوت", "84182100", "بدنه عایق‌بندی‌شده کابین", "84189910", "5%", 1),
        ("کولر گازی اینورتر ۲۴۰۰۰", "84151010", "کندانسور و اواپراتور آلومینیومی", "84189990", "5%", 1)
    ]
    cursor.executemany("""
        INSERT INTO BomDefinitions (FinishedGoodName, FinishedGoodHsCode, PartName, PartHsCode, PartDuty, IsEssential)
        VALUES (?, ?, ?, ?, ?, ?)
    """, bom_samples * 2000)

    provinces = ["تهران", "هرمزگان", "بوشهر", "خوزستان", "فارس", "اصفهان", "آذربایجان شرقی", "خراسان رضوی"]
    gateways_data = []
    for i in range(1, TARGET_RECORD_COUNT + 1):
        prov = random.choice(provinces)
        gateways_data.append((
            random.choice(["CUSTOMS", "TELECOM", "BANKING"]),
            f"GW-CODE-{i:05d}",
            f"گمرک / دکل عملیاتی {fake.city()}",
            prov,
            round(random.uniform(44.0, 62.0), 4),
            round(random.uniform(25.0, 38.0), 4),
            random.choice(["GATEWAY_BORDER", "BTS_CELL_SITE", "BRANCH_HUB"]),
            random.randint(15, 98)
        ))
    cursor.executemany("""
        INSERT INTO TacticalGateways (Domain, Code, Name, Province, Longitude, Latitude, Category, RiskScore)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, gateways_data)

    orders_data = []
    cbi_data = []
    epl_data = []
    
    national_ids = [f"1010{random.randint(1000000, 9999999)}" for _ in range(500)]
    hs_pool = [("84713000", "لپ‌تاپ گیمینگ"), ("85171300", "تلفن همراه هوشمند"), ("84182100", "قطعات یخچال"), ("96081000", "لوازم اداری")]

    for i in range(1, TARGET_RECORD_COUNT + 1):
        order_no = f"NTSW-2026-{i:06d}"
        nid = random.choice(national_ids)
        comp_name = f"شرکت بازرگانی {fake.last_name()}"
        hs, desc = random.choice(hs_pool)
        usd = round(random.uniform(10000, 250000), 2)
        dt = (base_date + timedelta(days=random.randint(0, 80))).strftime("%Y-%m-%d")

        orders_data.append((order_no, nid, comp_name, hs, desc, usd, dt))
        cbi_data.append((f"CBI-TRK-{i:06d}", order_no, nid, "NIMA", usd, dt))
        epl_data.append((f"EPL-COT-{i:06d}", order_no, nid, hs, f"ترخیص {desc}", round(usd * random.uniform(0.7, 1.0), 2), dt, round(usd * 0.15, 2), 0))

    cursor.executemany("INSERT INTO ntsw_orders VALUES (?, ?, ?, ?, ?, ?, ?)", orders_data)
    cursor.executemany("INSERT INTO cbi_allocations VALUES (?, ?, ?, ?, ?, ?)", cbi_data)
    cursor.executemany("INSERT INTO epl_declarations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", epl_data)

    bank_data = []
    for i in range(1, TARGET_RECORD_COUNT + 1):
        bank_data.append((
            f"RRN-{i:08d}",
            f"IR{random.randint(10,99)}0170000000{random.randint(100000000,999999999)}",
            f"IR{random.randint(10,99)}0120000000{random.randint(100000000,999999999)}",
            random.choice(national_ids),
            random.randint(50000050, 5000000000),
            (base_date + timedelta(days=random.randint(0, 80))).strftime("%Y-%m-%d %H:%M:%S"),
            0
        ))
    cursor.executemany("INSERT INTO bank_transactions VALUES (?, ?, ?, ?, ?, ?, ?)", bank_data)

    cdr_data = []
    for i in range(1, TARGET_RECORD_COUNT + 1):
        cdr_data.append((
            f"CALL-{i:08d}",
            f"0912{random.randint(1000000, 9999999)}",
            f"0935{random.randint(1000000, 9999999)}",
            random.choice(national_ids),
            f"4321100{random.randint(10000000, 99999999)}",
            f"8642090{random.randint(1000000, 9999999)}",
            f"BTS-TEH-{random.randint(100, 999)}",
            random.randint(5, 45000),
            (base_date + timedelta(days=random.randint(0, 80))).strftime("%Y-%m-%d %H:%M:%S"),
            0
        ))
    cursor.executemany("INSERT INTO telecom_cdrs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", cdr_data)

    conn.commit()
    conn.close()
    
    print(f"✅ موفقیت: دیتابیس با ستون IsEssential در جدول BomDefinitions بازنشانی شد در:\n{DB_PATH}")

if __name__ == "__main__":
    seed_large_scale_data()