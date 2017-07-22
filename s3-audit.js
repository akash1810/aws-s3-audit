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

const S3 = new AWS.S3();

async function isBucketPublicViaAcl(bucket) {
    const data = await S3.getBucketAcl({Bucket: bucket.Name}).promise();

    const publicAcls = data.Grants.filter(g => {
        return g.Grantee.URI
            && g.Grantee.URI === 'http://acs.amazonaws.com/groups/global/AllUsers'
            && ['READ', 'READ_ACP', 'FULL_CONTROL'].includes(g.Permission);
    });

    return publicAcls.length !== 0;
}

async function isBucketPublicViaPolicy(bucket) {
    const isPublicPrincipal = (principal) => {
        return typeof(principal) === 'object'
            ? principal.AWS === '*'
            : principal === '*';
    };

    try {
        const data = await S3.getBucketPolicy({Bucket: bucket.Name}).promise();
        const policy = JSON.parse(data.Policy);

        const publicGetters = policy.Statement.filter(statement => {
            return statement.Effect === 'Allow'
                && statement.Action === 's3:GetObject'
                && isPublicPrincipal(statement.Principal)
                && statement.Condition === undefined; // assume * GetObject policies with a Conditional aren't open to the world
        });

        return publicGetters.length !== 0;

    } catch (e) {
        if (e.code === 'NoSuchBucketPolicy') {
            return false;
        } else {
            throw e;
        }
    }
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

async function main() {
    console.log(`Fetching information for S3 buckets in ${Config.profile}`);
    const bucketList = await S3.listBuckets().promise();
    console.log(`There are ${bucketList.Buckets.length} buckets`);

    const bucketInfo = await Promise.all(bucketList.Buckets.map(_ => getBucketInfo(_)));

    const fields = Object.keys(bucketInfo[0]);
    const csv = json2csv({data: bucketInfo, fields: fields});

    const filename = `${Config.profile}-buckets.csv`;
    fs.writeFileSync(filename, csv);

    return filename;
}

main()
    .then(filename => console.log(`${filename} created`))
    .catch(e => console.log(e));
