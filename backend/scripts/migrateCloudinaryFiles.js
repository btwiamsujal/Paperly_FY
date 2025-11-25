const cloudinary = require('cloudinary').v2;
const Message = require('./models/Message');
require('dotenv').config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Migration script to update existing Cloudinary files to public access
 * This fixes files uploaded before the access_mode: 'public' fix
 */
async function migrateCloudinaryFiles() {
  try {
    console.log('🔄 Starting Cloudinary file migration...\n');

    // Get all messages with file URLs
    const messages = await Message.find({
      fileUrl: { $exists: true, $ne: null },
      messageType: { $in: ['document', 'media', 'voice'] }
    });

    console.log(`Found ${messages.length} messages with files\n`);

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const message of messages) {
      try {
        // Extract public_id from Cloudinary URL
        const urlParts = message.fileUrl.split('/');
        const uploadIndex = urlParts.indexOf('upload');
        if (uploadIndex === -1) {
          console.log(`⚠️  Skipping non-Cloudinary URL: ${message.fileUrl}`);
          skippedCount++;
          continue;
        }

        // Get everything after /upload/v{version}/
        const pathAfterUpload = urlParts.slice(uploadIndex + 2).join('/');
        // Remove file extension to get public_id
        const publicId = pathAfterUpload.replace(/\.[^/.]+$/, '');

        console.log(`Processing: ${message.fileName || 'Unknown'}`);
        console.log(`  Public ID: ${publicId}`);

        // Determine resource type
        let resourceType = 'raw'; // default for documents
        if (message.messageType === 'media') {
          if (message.mimeType && message.mimeType.startsWith('image/')) {
            resourceType = 'image';
          } else if (message.mimeType && message.mimeType.startsWith('video/')) {
            resourceType = 'video';
          }
        } else if (message.messageType === 'voice') {
          resourceType = 'video'; // audio is stored as video in Cloudinary
        }

        console.log(`  Resource type: ${resourceType}`);

        // Update the file to public access
        const result = await cloudinary.uploader.explicit(publicId, {
          resource_type: resourceType,
          type: 'upload',
          access_mode: 'public'
        });

        console.log(`  ✅ Updated successfully`);
        console.log(`  New URL: ${result.secure_url}\n`);
        
        // Optionally update the message with new URL
        if (result.secure_url !== message.fileUrl) {
          message.fileUrl = result.secure_url;
          await message.save();
          console.log(`  📝 Updated message URL in database\n`);
        }

        successCount++;

      } catch (error) {
        console.error(`  ❌ Error processing ${message.fileName}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`  ✅ Success: ${successCount}`);
    console.log(`  ❌ Errors: ${errorCount}`);
    console.log(`  ⚠️  Skipped: ${skippedCount}`);
    console.log(`  📁 Total: ${messages.length}`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

// Run if called directly
if (require.main === module) {
  const mongoose = require('mongoose');
  
  mongoose.connect(process.env.MONGO_URI)
    .then(() => {
      console.log('✅ Connected to MongoDB\n');
      return migrateCloudinaryFiles();
    })
    .then(() => {
      console.log('\n✅ Migration complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration error:', error);
      process.exit(1);
    });
}

module.exports = { migrateCloudinaryFiles };
