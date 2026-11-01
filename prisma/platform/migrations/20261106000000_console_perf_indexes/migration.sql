-- Indexes for the console Overview/Payments/Workspaces queries (range filters on dates, status + paidAt).
CREATE INDEX "Tenant_createdAt_idx" ON "Tenant"("createdAt");
CREATE INDEX "Tenant_trialEndsAt_idx" ON "Tenant"("trialEndsAt");
CREATE INDEX "Invoice_status_paidAt_idx" ON "Invoice"("status", "paidAt");
CREATE INDEX "Invoice_issuedAt_idx" ON "Invoice"("issuedAt");
CREATE INDEX "Refund_at_idx" ON "Refund"("at");
CREATE INDEX "SubscriptionHistory_at_idx" ON "SubscriptionHistory"("at");
