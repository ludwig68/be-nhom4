require('dotenv').config()

const pool = require('../src/config/db')

const ROOM_BLUEPRINTS = [
  { roomNumber: '101', branchOffset: 0, typePriority: [1, 2, 3, 5], status: 'trống' },
  { roomNumber: '102', branchOffset: 0, typePriority: [2, 1, 5, 3], status: 'đã đặt' },
  { roomNumber: '103', branchOffset: 0, typePriority: [5, 2, 1, 3], status: 'bảo trì' },

  { roomNumber: '201', branchOffset: 1, typePriority: [1, 2, 5, 3], status: 'trống' },
  { roomNumber: '202', branchOffset: 1, typePriority: [2, 1, 5, 3], status: 'đang ở' },
  { roomNumber: '203', branchOffset: 1, typePriority: [5, 2, 1, 3], status: 'đang dọn' },

  { roomNumber: '301', branchOffset: 2, typePriority: [3, 1, 2, 5], status: 'trống' },
  { roomNumber: '302', branchOffset: 2, typePriority: [2, 1, 5, 3], status: 'đã đặt' },
  { roomNumber: '303', branchOffset: 2, typePriority: [5, 2, 1, 3], status: 'trống' }
]

const ROOM_IMAGE_BLUEPRINTS = [
  { typeId: 1, imageUrl: 'https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=1200&q=80' },
  { typeId: 1, imageUrl: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80' },
  { typeId: 2, imageUrl: 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=1200&q=80' },
  { typeId: 2, imageUrl: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=1200&q=80' },
  { typeId: 3, imageUrl: 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=1200&q=80' },
  { typeId: 5, imageUrl: 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=1200&q=80' },
  { typeId: 5, imageUrl: 'https://images.unsplash.com/photo-1591088398332-8a7791972843?auto=format&fit=crop&w=1200&q=80' }
]

const pickTypeId = (typePriority, typeIdsSet) => {
  for (const candidate of typePriority) {
    if (typeIdsSet.has(candidate)) {
      return candidate
    }
  }

  return null
}

const main = async () => {
  try {
    const [branches] = await pool.query(
      'SELECT branch_id, branch_name FROM branches WHERE is_active = 1 ORDER BY branch_id'
    )
    const [roomTypes] = await pool.query('SELECT type_id, type_name FROM room_types ORDER BY type_id')

    if (branches.length === 0) {
      console.log('Không có chi nhánh hoạt động để seed phòng.')
      return
    }

    if (roomTypes.length === 0) {
      console.log('Không có room_types để seed phòng.')
      return
    }

    const typeIdsSet = new Set(roomTypes.map((item) => Number(item.type_id)))

    let inserted = 0
    let skipped = 0

    for (const blueprint of ROOM_BLUEPRINTS) {
      const branch = branches[blueprint.branchOffset]
      if (!branch) {
        skipped += 1
        continue
      }

      const typeId = pickTypeId(blueprint.typePriority, typeIdsSet)
      if (!typeId) {
        skipped += 1
        continue
      }

      const [existing] = await pool.query(
        'SELECT room_id FROM rooms WHERE branch_id = ? AND room_number = ? LIMIT 1',
        [branch.branch_id, blueprint.roomNumber]
      )

      if (existing.length > 0) {
        skipped += 1
        continue
      }

      await pool.query(
        'INSERT INTO rooms (room_number, branch_id, type_id, status) VALUES (?, ?, ?, ?)',
        [blueprint.roomNumber, branch.branch_id, typeId, blueprint.status]
      )

      inserted += 1
    }

    let insertedImages = 0
    for (const image of ROOM_IMAGE_BLUEPRINTS) {
      if (!typeIdsSet.has(image.typeId)) {
        continue
      }

      const [existingImage] = await pool.query(
        'SELECT image_id FROM room_images WHERE room_type_id = ? AND image_url = ? LIMIT 1',
        [image.typeId, image.imageUrl]
      )

      if (existingImage.length > 0) {
        continue
      }

      await pool.query(
        'INSERT INTO room_images (room_type_id, image_url) VALUES (?, ?)',
        [image.typeId, image.imageUrl]
      )
      insertedImages += 1
    }

    const [totalRows] = await pool.query('SELECT COUNT(*) AS total FROM rooms')
    const [totalImagesRows] = await pool.query('SELECT COUNT(*) AS total FROM room_images')
    const total = totalRows[0]?.total || 0
    const totalImages = totalImagesRows[0]?.total || 0

    console.log(
      `Seed mock data done. inserted_rooms=${inserted}, skipped_rooms=${skipped}, total_rooms=${total}, inserted_images=${insertedImages}, total_images=${totalImages}`
    )
  } catch (error) {
    console.error('Seed thất bại:', error.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
