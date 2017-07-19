#!/usr/bin/env node

const AWS = require('aws-sdk');
const json2csv = require('json2csv');
const fs = require('fs');

class Config {
    static get profile() {
        return process.env.PROFILE || 'default';
    }
    static get region() {
        return process.env.REGION || 'eu-west-1';
    }
}

AWS.config.update({
    credentials: new AWS.SharedIniFileCredentials({
        profile: Config.profile
    }),
    region: Config.region
});

const s3 = new AWS.S3();

s3.listBuckets({}, (err, data) => {
    if (err) {
        console.log(err);
        throw err;
    }

    const buckets = data.Buckets.map(bucket => {
        return {
            Created: bucket.CreationDate,
            Bucket: bucket.Name,
            Account: Config.profile
        };
    });

    const fields = Object.keys(buckets[0]);

    const csv = json2csv({data: buckets, fields: fields});

    const filename = `${Config.profile}-buckets.csv`;

    fs.writeFile(filename, csv, err => {
        if (err) {
            console.log(err);
            throw err;
        }

        console.log(`${filename} created`);
    });
});
