export default async function waitForMinDelay(startTime, minTime = 500) {
    const elapsedTime = Date.now() - startTime;
    const delay = Math.max(minTime - elapsedTime, 0);

    if (delay) {
        await new Promise(resolve => setTimeout(resolve, delay));
    }
}
