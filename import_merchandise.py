#!/usr/bin/env python3
import json
import os
import subprocess
import sys

# MongoDB connection info
MONGO_URI = "mongodb://admin:admin123@localhost:27017/hiking?authSource=admin"
DB_NAME = "hiking"

# Base directory
BASE_DIR = "/home/bravo/merchandise_list"

# Brand list
BRANDS = ["BlackYAK", "Columbia", "Discovery", "EIDER", "K2", "Nepa"]

def get_top_main_files(brand):
    """Get all top (상의 + 아우터) main files for a brand (excluding thumbnails)"""
    files = []
    # 상의 files
    top_dir = os.path.join(BASE_DIR, brand, "top", "상의")
    if os.path.exists(top_dir):
        for f in os.listdir(top_dir):
            if f.endswith(".json") and "thumbnails" not in f and "summary" not in f:
                files.append(os.path.join(top_dir, f))
    # 아우터 files
    outer_dir = os.path.join(BASE_DIR, brand, "top", "아우터")
    if os.path.exists(outer_dir):
        for f in os.listdir(outer_dir):
            if f.endswith(".json") and "thumbnails" not in f and "summary" not in f:
                files.append(os.path.join(outer_dir, f))
    return files

def get_top_thumbnails_files(brand):
    """Get all top (상의 + 아우터) thumbnails files for a brand"""
    files = []
    # 상의 thumbnails
    top_dir = os.path.join(BASE_DIR, brand, "top", "상의")
    if os.path.exists(top_dir):
        for f in os.listdir(top_dir):
            if f.endswith("_thumbnails.json"):
                files.append(os.path.join(top_dir, f))
    # 아우터 thumbnails
    outer_dir = os.path.join(BASE_DIR, brand, "top", "아우터")
    if os.path.exists(outer_dir):
        for f in os.listdir(outer_dir):
            if f.endswith("_thumbnails.json"):
                files.append(os.path.join(outer_dir, f))
    return files

def get_bottom_main_files(brand):
    """Get all bottom (하의) main files for a brand (excluding thumbnails)"""
    files = []
    bottom_dir = os.path.join(BASE_DIR, brand, "bottom")
    if os.path.exists(bottom_dir):
        for f in os.listdir(bottom_dir):
            if f.endswith(".json") and "thumbnails" not in f and "summary" not in f:
                files.append(os.path.join(bottom_dir, f))
    return files

def get_bottom_thumbnails_files(brand):
    """Get all bottom (하의) thumbnails files for a brand"""
    files = []
    bottom_dir = os.path.join(BASE_DIR, brand, "bottom")
    if os.path.exists(bottom_dir):
        for f in os.listdir(bottom_dir):
            if f.endswith("_thumbnails.json"):
                files.append(os.path.join(bottom_dir, f))
    return files

def get_shoes_main_files(brand):
    """Get all shoes (등산화) main files for a brand (excluding thumbnails)"""
    files = []
    shoes_dir = os.path.join(BASE_DIR, brand, "shoes")
    if os.path.exists(shoes_dir):
        for f in os.listdir(shoes_dir):
            if f.endswith(".json") and "thumbnails" not in f and "summary" not in f:
                files.append(os.path.join(shoes_dir, f))
    return files

def get_shoes_thumbnails_files(brand):
    """Get all shoes (등산화) thumbnails files for a brand"""
    files = []
    shoes_dir = os.path.join(BASE_DIR, brand, "shoes")
    if os.path.exists(shoes_dir):
        for f in os.listdir(shoes_dir):
            if f.endswith("_thumbnails.json"):
                files.append(os.path.join(shoes_dir, f))
    return files

def get_goods_main_files(brand):
    """Get all goods (용품) main files for a brand (excluding thumbnails)"""
    files = []
    goods_dir = os.path.join(BASE_DIR, brand, "goods")
    if os.path.exists(goods_dir):
        for f in os.listdir(goods_dir):
            if f.endswith(".json") and "thumbnails" not in f and "summary" not in f:
                files.append(os.path.join(goods_dir, f))
    return files

def get_goods_thumbnails_files(brand):
    """Get all goods (용품) thumbnails files for a brand"""
    files = []
    goods_dir = os.path.join(BASE_DIR, brand, "goods")
    if os.path.exists(goods_dir):
        for f in os.listdir(goods_dir):
            if f.endswith("_thumbnails.json"):
                files.append(os.path.join(goods_dir, f))
    return files

def merge_json_files(file_list):
    """Merge multiple JSON array files into one array"""
    merged = []
    for file_path in file_list:
        if os.path.exists(file_path):
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        merged.extend(data)
                    else:
                        merged.append(data)
            except Exception as e:
                print(f"Error reading {file_path}: {e}")
    return merged

def import_to_mongodb(collection_name, data, container_name="hiking-mongodb"):
    """Import data to MongoDB collection"""
    if not data:
        print(f"No data to import for {collection_name}")
        return
    
    # Create temp file
    temp_file = f"/tmp/{collection_name}_import.json"
    with open(temp_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    # Copy to container
    subprocess.run(["docker", "cp", temp_file, f"{container_name}:/tmp/{collection_name}_import.json"], check=True)
    
    # Import to MongoDB
    cmd = [
        "docker", "exec", container_name,
        "bash", "-lc",
        f'mongoimport --uri="{MONGO_URI}" --collection={collection_name} --jsonArray --file=/tmp/{collection_name}_import.json'
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode == 0:
        print(f"✓ Successfully imported {len(data)} documents to {collection_name}")
    else:
        print(f"✗ Error importing to {collection_name}: {result.stderr}")
    
    # Cleanup
    os.remove(temp_file)
    subprocess.run(["docker", "exec", container_name, "rm", f"/tmp/{collection_name}_import.json"], check=False)

def main():
    print("Starting merchandise data import to MongoDB...")
    print("Main and thumbnails will be imported to separate collections.\n")
    
    # 1. top 컬렉션 (상의 + 아우터 main)
    print("=" * 50)
    print("1. Importing top collection (main files)...")
    print("=" * 50)
    top_data = []
    for brand in BRANDS:
        files = get_top_main_files(brand)
        if files:
            brand_data = merge_json_files(files)
            top_data.extend(brand_data)
            print(f"  {brand}: {len(brand_data)} items from {len(files)} files")
    import_to_mongodb("top", top_data)
    print()
    
    # 2. top_thumbnails 컬렉션 (상의 + 아우터 thumbnails)
    print("=" * 50)
    print("2. Importing top_thumbnails collection...")
    print("=" * 50)
    top_thumbnails_data = []
    for brand in BRANDS:
        files = get_top_thumbnails_files(brand)
        if files:
            brand_data = merge_json_files(files)
            top_thumbnails_data.extend(brand_data)
            print(f"  {brand}: {len(brand_data)} items from {len(files)} files")
    import_to_mongodb("top_thumbnails", top_thumbnails_data)
    print()
    
    # 3. bottom 컬렉션 (하의 main)
    print("=" * 50)
    print("3. Importing bottom collection (main files)...")
    print("=" * 50)
    bottom_data = []
    for brand in BRANDS:
        files = get_bottom_main_files(brand)
        if files:
            brand_data = merge_json_files(files)
            bottom_data.extend(brand_data)
            print(f"  {brand}: {len(brand_data)} items from {len(files)} files")
    import_to_mongodb("bottom", bottom_data)
    print()
    
    # 4. bottom_thumbnails 컬렉션 (하의 thumbnails)
    print("=" * 50)
    print("4. Importing bottom_thumbnails collection...")
    print("=" * 50)
    bottom_thumbnails_data = []
    for brand in BRANDS:
        files = get_bottom_thumbnails_files(brand)
        if files:
            brand_data = merge_json_files(files)
            bottom_thumbnails_data.extend(brand_data)
            print(f"  {brand}: {len(brand_data)} items from {len(files)} files")
    import_to_mongodb("bottom_thumbnails", bottom_thumbnails_data)
    print()
    
    # 5. shoes 컬렉션 (등산화 main)
    print("=" * 50)
    print("5. Importing shoes collection (main files)...")
    print("=" * 50)
    shoes_data = []
    for brand in BRANDS:
        files = get_shoes_main_files(brand)
        if files:
            brand_data = merge_json_files(files)
            shoes_data.extend(brand_data)
            print(f"  {brand}: {len(brand_data)} items from {len(files)} files")
        else:
            print(f"  {brand}: No shoes data (skipped)")
    import_to_mongodb("shoes", shoes_data)
    print()
    
    # 6. shoes_thumbnails 컬렉션 (등산화 thumbnails)
    print("=" * 50)
    print("6. Importing shoes_thumbnails collection...")
    print("=" * 50)
    shoes_thumbnails_data = []
    for brand in BRANDS:
        files = get_shoes_thumbnails_files(brand)
        if files:
            brand_data = merge_json_files(files)
            shoes_thumbnails_data.extend(brand_data)
            print(f"  {brand}: {len(brand_data)} items from {len(files)} files")
        else:
            print(f"  {brand}: No shoes thumbnails data (skipped)")
    import_to_mongodb("shoes_thumbnails", shoes_thumbnails_data)
    print()
    
    # 7. goods 컬렉션 (용품 main)
    print("=" * 50)
    print("7. Importing goods collection (main files)...")
    print("=" * 50)
    goods_data = []
    for brand in BRANDS:
        files = get_goods_main_files(brand)
        if files:
            brand_data = merge_json_files(files)
            goods_data.extend(brand_data)
            print(f"  {brand}: {len(brand_data)} items from {len(files)} files")
    import_to_mongodb("goods", goods_data)
    print()
    
    # 8. goods_thumbnails 컬렉션 (용품 thumbnails)
    print("=" * 50)
    print("8. Importing goods_thumbnails collection...")
    print("=" * 50)
    goods_thumbnails_data = []
    for brand in BRANDS:
        files = get_goods_thumbnails_files(brand)
        if files:
            brand_data = merge_json_files(files)
            goods_thumbnails_data.extend(brand_data)
            print(f"  {brand}: {len(brand_data)} items from {len(files)} files")
    import_to_mongodb("goods_thumbnails", goods_thumbnails_data)
    print()
    
    print("=" * 50)
    print("Import completed!")
    print("=" * 50)
    print("\nCreated collections:")
    print("  - top (main)")
    print("  - top_thumbnails")
    print("  - bottom (main)")
    print("  - bottom_thumbnails")
    print("  - shoes (main)")
    print("  - shoes_thumbnails")
    print("  - goods (main)")
    print("  - goods_thumbnails")

if __name__ == "__main__":
    main()





