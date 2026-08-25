import 'package:flutter/material.dart';
import '../theme.dart';

class CrossLogo extends StatelessWidget {
  final double size;
  const CrossLogo({super.key, this.size = 40});

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [c.brand, c.gold],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(size * 0.23),
      ),
      child: Center(
        child: SizedBox(
          width: size * 0.46,
          height: size * 0.6,
          child: Stack(
            children: [
              // vertical bar
              Align(
                alignment: Alignment.topCenter,
                child: Container(
                  width: size * 0.13,
                  height: size * 0.6,
                  decoration: BoxDecoration(
                    color: c.brandInk,
                    borderRadius: BorderRadius.circular(size * 0.05),
                  ),
                ),
              ),
              // horizontal bar (upper third)
              Align(
                alignment: const Alignment(0, -0.35),
                child: Container(
                  width: size * 0.46,
                  height: size * 0.13,
                  decoration: BoxDecoration(
                    color: c.brandInk,
                    borderRadius: BorderRadius.circular(size * 0.05),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
