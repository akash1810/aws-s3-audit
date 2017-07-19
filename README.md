# S3 Audit

Create a CSV detailing the creation time, name and public access state of S3 buckets.

A bucket is deemed public if:
- its ACL allows `READ`, `READ_ACP` or `FULL_CONTROL` to all users
- its policy allows `s3:GetObject` to the `*` Principal 

See:
- http://docs.aws.amazon.com/AmazonS3/latest/dev/acl-overview.html#permissions
- http://docs.aws.amazon.com/AmazonS3/latest/dev/example-bucket-policies.html

Install dependencies with `npm install`

## Usage
```bash
export PROFILE=media-service && ./s3-audit.js
```
