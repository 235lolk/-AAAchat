#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

// Ensure env from server/.env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const sqlPath = path.join(__dirname, '..', '..', 'docs', 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const cfg = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
    // Do not set database here; schema.sql contains CREATE DATABASE and USE
  };
  const conn = await mysql.createConnection(cfg);
  console.log('Connected to MySQL at', cfg.host + ':' + cfg.port);
  try {
    await conn.query(sql);
    console.log('Schema initialized from', sqlPath);
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error('Init DB failed:', err);
  process.exit(1);
});