#!/usr/bin/env node

const AWS = require('aws-sdk');
const json2csv = require('json2csv');
const fs = require('fs');

class Config {
    static get profile() {
        return process.env.PROFILE || 'media-service';
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


function getBucketInfo(bucket) {
    return new Promise((resolve, reject) => {
        const s3 = new AWS.S3();

        s3.getBucketAcl({Bucket: bucket.Name}, (err, acl) => {
            if (err) {
                reject(err);
            } else {
                const publicAcls = acl.Grants.filter(g => {
                    return g.Grantee.URI
                        && g.Grantee.URI === 'http://acs.amazonaws.com/groups/global/AllUsers'
                        && ['READ', 'READ_ACP', 'FULL_CONTROL'].includes(g.Permission);
                });

                const bucketInfo = {
                    Created: bucket.CreationDate,
                    Bucket: bucket.Name,
                    Account: Config.profile,
                    IsPublic: publicAcls.length !== 0
                };

                s3.getBucketPolicy({Bucket: bucket.Name}, (e, policyData) => {
                    if (e) {
                        if (e.code === 'NoSuchBucketPolicy') {
                            resolve(bucketInfo);
                        } else {
                            reject(e);
                        }
                    } else {
                        const policy = JSON.parse(policyData.Policy);

                        const publicGetters = policy.Statement.filter(statement => {
                            return statement.Effect === 'Allow'
                                && statement.Action === 's3:GetObject'
                                && statement.Principal === '*';
                        });

                        const bucketInfoWithPolicy = Object.assign({}, bucketInfo, {
                            IsPublic: publicAcls.length !== 0 || publicGetters.length !== 0
                        });

                        resolve(bucketInfoWithPolicy);

                    }
                });

            }
        });
    });
}

function getBuckets() {
    return new Promise((resolve, reject) => {
        const s3 = new AWS.S3();

        s3.listBuckets({}, (err, data) => {
            if (err) {
                reject(err);
            }

            resolve(data.Buckets);
        });
    });
}

getBuckets().then(buckets => {
    const promises = buckets.map(bucket => getBucketInfo(bucket));

    Promise.all(promises)
        .then(bucketInfo => {
            const fields = Object.keys(bucketInfo[0]);

            const csv = json2csv({data: bucketInfo, fields: fields});

            const filename = `${Config.profile}-buckets.csv`;

            fs.writeFile(filename, csv, err => {
                if (err) {
                    console.log(err);
                    throw err;
                }

                console.log(`${filename} created`);
            });
        }).catch(err => {
            console.log(err);
            throw(err);
        });
}).catch(err => {
    console.log(err);
    throw err;
});
