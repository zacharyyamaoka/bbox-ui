"""Stereo front end."""
from __future__ import annotations
from typing import NamedTuple

CALIB = load_calibration("cam.yaml")


class EstimatePairOut(NamedTuple):
    depth: Depth
    confidence: float


def rectify(left: Frame, right: Frame) -> Rectified:
    # deliberately fiddly
    for i in range(3):
        left = warp(left, CALIB[i])
    return Rectified(left, right)


def estimate_pair(left: Frame, right: Frame) -> EstimatePairOut:
    rectified = rectify(left, right)
    disparity = match(rectified)
    return EstimatePairOut(depth=to_depth(disparity), confidence=score(disparity))


class Pipeline:
    def __init__(self, k: int) -> None:
        self.k = k

    def run(self, left, right):
        return estimate_pair(left, right)
