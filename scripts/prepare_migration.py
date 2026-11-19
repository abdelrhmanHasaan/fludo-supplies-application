import os

with open('database.sql', 'r', encoding='utf-8') as f:
    content = f.read()

target = "IF r.table_name NOT IN ('users','edit_approvals','user_roles','app_settings','document_sequences') THEN"
replacement = "IF r.table_name NOT IN ('users','edit_approvals','user_roles','app_settings','document_sequences','sync_outbox','sync_inbox','sync_state','sync_conflicts','audit_log','schema_migrations') THEN"

if target in content:
    content = content.replace(target, replacement)
    print("Found and replaced target trigger exclusion.")
else:
    print("WARNING: target not found!")

os.makedirs('db/migrations', exist_ok=True)
with open('db/migrations/0001_initial.sql', 'w', encoding='utf-8') as f:
    f.write(content)

print("Migration 0001_initial.sql written successfully.")

