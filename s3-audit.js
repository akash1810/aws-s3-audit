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

function isBucketPublicViaAcl(bucket) {
    return new Promise((resolve, reject) => {
        const s3 = new AWS.S3();

        s3.getBucketAcl({Bucket: bucket.Name}, (err, data) => {
            if (err) {
                reject(err);
            } else {
                const publicAcls = data.Grants.filter(g => {
                    return g.Grantee.URI
                        && g.Grantee.URI === 'http://acs.amazonaws.com/groups/global/AllUsers'
                        && ['READ', 'READ_ACP', 'FULL_CONTROL'].includes(g.Permission);
                });

                resolve(publicAcls.length !== 0);
            }
        })
    });
}

function isBucketPublicViaPolicy(bucket) {
    const isPublicPrincipal = (principal) => {
        return typeof(principal) === 'object'
            ? principal.AWS === '*'
            : principal === '*';
    };

    return new Promise((resolve, reject) => {
        const s3 = new AWS.S3();

        s3.getBucketPolicy({Bucket: bucket.Name}, (e, data) => {
            if (e) {
                if (e.code === 'NoSuchBucketPolicy') {
                    resolve(false);
                } else {
                    reject(e);
                }
            } else {
                const policy = JSON.parse(data.Policy);

                const publicGetters = policy.Statement.filter(statement => {
                    return statement.Effect === 'Allow'
                        && statement.Action === 's3:GetObject'
                        && isPublicPrincipal(statement.Principal)
                        && statement.Condition === undefined; // assume * GetObject policies with a Conditional aren't open to the world
                });

                resolve(publicGetters.length !== 0);
            }
        });
    });
}

function getBucketInfo(bucket) {
    return new Promise((resolve, reject) => {
        Promise.all([
            isBucketPublicViaAcl(bucket),
            isBucketPublicViaPolicy(bucket)
        ]).then(policies => {
            const [isAclPublic, isPolicyPublic] = policies;

            const bucketInfo = {
                Created: bucket.CreationDate,
                Bucket: bucket.Name,
                Account: Config.profile,
                IsPublic: isAclPublic || isPolicyPublic
            };

            resolve(bucketInfo);
        }).catch(err => {
            console.log(err);
            reject(err);
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
        })
        .catch(err => {
            console.log(err);
            throw(err);
        });
}).catch(err => {
    console.log(err);
    throw err;
});
