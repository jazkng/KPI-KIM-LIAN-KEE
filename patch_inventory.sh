#!/bin/bash

# Fix activeTasks
sed -i 's/task.items.every(item => allowedScopes.includes(getInventoryScopeForCategory(item.category)))/(task.assigneeId === employee?.id || task.items.every(item => allowedScopes.includes(getInventoryScopeForCategory(item.category))))/g' components/features/inventory/InventoryModule.tsx

# Wait, this might replace it in startEditingTask where we don't want it.
# Let's be more precise.
