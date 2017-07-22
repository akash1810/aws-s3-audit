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

async function getBucketInfo(bucket) {
    const isAclPublic = await isBucketPublicViaAcl(bucket);
    const isPolicyPublic = await isBucketPublicViaPolicy(bucket);

    return {
        Created: bucket.CreationDate,
        Bucket: bucket.Name,
        Account: Config.profile,
        IsPublic: isAclPublic || isPolicyPublic
    };
}

function getBuckets() {
    return new Promise((resolve, reject) => {
        const s3 = new AWS.S3();

        s3.listBuckets({}, (err, data) => {
            err ? reject(err) : resolve(data.Buckets)
        });
    });
}

async function main() {
    const buckets = await getBuckets();
    const bucketInfo = await Promise.all(buckets.map(_ => getBucketInfo(_)));

    const fields = Object.keys(bucketInfo[0]);
    const csv = json2csv({data: bucketInfo, fields: fields});

    const filename = `${Config.profile}-buckets.csv`;
    fs.writeFileSync(filename, csv);

    return filename;
}

console.log(`Fetching information for S3 buckets in ${Config.profile}`);

main()
    .then(filename => console.log(`${filename} created`))
    .catch(e => console.log(e));
