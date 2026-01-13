-- Enable Read Access for Public/Anon users to the leads tables

-- 1. leads_capturados_posts
ALTER TABLE leads_capturados_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users"
ON leads_capturados_posts
FOR SELECT
TO anon, authenticated
USING (true);

-- 2. leads_qualificados_ia
ALTER TABLE leads_qualificados_ia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users"
ON leads_qualificados_ia
FOR SELECT
TO anon, authenticated
USING (true);

-- Optional: Grant insert access just in case your n8n uses anon key (unlikely, but good for testing)
CREATE POLICY "Enable insert access for all users"
ON leads_capturados_posts
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Enable insert access for all users"
ON leads_qualificados_ia
FOR INSERT
TO anon, authenticated
WITH CHECK (true);
