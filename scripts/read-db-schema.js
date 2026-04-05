const fs = require('fs')
const path = require('path')

const defaultSchemaPath = path.resolve(__dirname, '../../database/db_bookroom.sql')

const parseArgs = (argv) => {
  const args = argv.slice(2)
  let schemaPath = defaultSchemaPath
  let table = ''

  for (const arg of args) {
    if (arg.startsWith('--table=')) {
      table = arg.slice('--table='.length).trim().toLowerCase()
      continue
    }

    if (!arg.startsWith('--')) {
      schemaPath = path.resolve(process.cwd(), arg)
    }
  }

  return { schemaPath, table }
}

const extractTables = (sqlContent) => {
  const matches = [...sqlContent.matchAll(/CREATE TABLE IF NOT EXISTS\s+`([^`]+)`\s*\(([\s\S]*?)\)\s*ENGINE=/gi)]

  return matches.map((match) => {
    const tableName = match[1]
    const block = match[2]
    const columns = block
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('`'))
      .map((line) => {
        const columnMatch = line.match(/^`([^`]+)`\s+(.+?)(?:,)?$/)
        if (!columnMatch) {
          return null
        }

        return {
          name: columnMatch[1],
          definition: columnMatch[2]
        }
      })
      .filter(Boolean)

    return {
      tableName,
      columns
    }
  })
}

const printResult = (schemaPath, tables, tableFilter) => {
  console.log(`Schema source: ${schemaPath}`)
  console.log(`Detected tables: ${tables.length}`)

  if (tables.length === 0) {
    console.log('No table definitions found.')
    return
  }

  if (tableFilter) {
    const target = tables.find((table) => table.tableName.toLowerCase() === tableFilter)
    if (!target) {
      console.log(`Table not found: ${tableFilter}`)
      return
    }

    console.log(`\nTable: ${target.tableName}`)
    target.columns.forEach((column) => {
      console.log(`- ${column.name}: ${column.definition}`)
    })
    return
  }

  console.log('\nTable overview:')
  tables.forEach((table) => {
    const columnNames = table.columns.map((column) => column.name).join(', ')
    console.log(`- ${table.tableName} (${table.columns.length} cols): ${columnNames}`)
  })
}

const main = () => {
  const { schemaPath, table } = parseArgs(process.argv)

  if (!fs.existsSync(schemaPath)) {
    console.error(`Schema file not found: ${schemaPath}`)
    process.exit(1)
  }

  const sqlContent = fs.readFileSync(schemaPath, 'utf8')
  const tables = extractTables(sqlContent)
  printResult(schemaPath, tables, table)
}

main()
